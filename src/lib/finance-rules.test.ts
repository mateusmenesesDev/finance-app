import { describe, expect, test } from "bun:test";

import {
	buildBudgetHistory,
	buildBudgetUsage,
	calculateAccountBalances,
	calculateMonthlyTotals,
	classifyBudgetStatus,
	getInvoiceForDate,
	listMonthOptions,
	parseMonthPeriod,
	type RuleAccount,
	type RuleBudget,
	type RuleCategory,
	type RuleCategoryGroup,
	type RuleTransaction,
	rankMonthlyCategories,
	rankMonthlyGroups,
	summarizeBudgetCoherence,
} from "./finance-rules";

const accounts: RuleAccount[] = [
	{
		id: 1,
		type: "checking",
		initialBalanceCents: 100_00,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
	{
		id: 2,
		type: "credit_card",
		initialBalanceCents: 0,
		creditCardClosingDay: 10,
		creditCardDueDay: 20,
	},
	{
		id: 3,
		type: "cash",
		initialBalanceCents: 0,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
];

const categories: RuleCategory[] = [
	{ id: 10, groupId: 100, name: "Mercado" },
	{ id: 11, groupId: 101, name: "Salário" },
	{ id: 12, groupId: 100, name: "Restaurante" },
];

const groups: RuleCategoryGroup[] = [
	{ id: 100, name: "Essenciais" },
	{ id: 101, name: "Renda" },
];

function tx(overrides: Partial<RuleTransaction>): RuleTransaction {
	return {
		accountId: 1,
		destinationAccountId: null,
		movementType: "expense",
		status: "confirmed",
		amountCents: 10_00,
		occurredOn: "2026-05-01",
		isArchived: false,
		...overrides,
	};
}

function budget(overrides: Partial<RuleBudget>): RuleBudget {
	return {
		id: 1,
		monthKey: "2026-05",
		scope: "month",
		categoryGroupId: null,
		categoryId: null,
		amountCents: 100_00,
		...overrides,
	};
}

describe("finance rules", () => {
	test("balances use only confirmed non-archived transactions", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({ movementType: "income", amountCents: 50_00 }),
			tx({ movementType: "expense", amountCents: 20_00, status: "planned" }),
			tx({ movementType: "expense", amountCents: 30_00, isArchived: true }),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(150_00);
	});

	test("one transfer transaction moves money to destination account", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({
				movementType: "transfer",
				amountCents: 25_00,
				destinationAccountId: 3,
			}),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(75_00);
		expect(balances.get(3)?.normalBalanceCents).toBe(25_00);
	});

	test("credit card payment reduces bank balance and card debt without expense duplication", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({ accountId: 2, movementType: "expense", amountCents: 80_00 }),
			tx({
				movementType: "credit_card_payment",
				amountCents: 30_00,
				destinationAccountId: 2,
			}),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(70_00);
		expect(balances.get(2)?.cardDebtCents).toBe(50_00);
	});

	test("parses a monthly period key", () => {
		expect(parseMonthPeriod("2026-02")).toEqual({
			key: "2026-02",
			start: "2026-02-01",
			end: "2026-02-28",
		});
		expect(parseMonthPeriod("2026-13")).toBe(null);
		expect(parseMonthPeriod("2026-2")).toBe(null);
	});

	test("monthly totals include only confirmed non-archived income and expenses", () => {
		const period = parseMonthPeriod("2026-05");
		if (period === null) throw new Error("invalid test period");

		expect(
			calculateMonthlyTotals(
				[
					tx({ movementType: "income", amountCents: 300_00 }),
					tx({ movementType: "expense", amountCents: 120_00 }),
					tx({
						movementType: "expense",
						amountCents: 40_00,
						status: "planned",
					}),
					tx({ movementType: "transfer", amountCents: 90_00 }),
					tx({ movementType: "credit_card_payment", amountCents: 50_00 }),
					tx({ movementType: "balance_adjustment", amountCents: 20_00 }),
					tx({ movementType: "income", amountCents: 70_00, isArchived: true }),
					tx({
						movementType: "income",
						amountCents: 80_00,
						occurredOn: "2026-06-01",
					}),
				],
				period,
			),
		).toEqual({
			incomeCents: 300_00,
			expenseCents: 120_00,
			netCents: 180_00,
			transactionCount: 2,
		});
	});

	test("category and group rankings are deterministic", () => {
		const period = parseMonthPeriod("2026-05");
		if (period === null) throw new Error("invalid test period");

		const transactions = [
			tx({ categoryId: 10, amountCents: 80_00 }),
			tx({ categoryId: 12, amountCents: 80_00 }),
			tx({ categoryId: 10, amountCents: 20_00 }),
			tx({ categoryId: null, amountCents: 10_00 }),
			tx({ categoryId: 11, movementType: "income", amountCents: 300_00 }),
		];

		expect(
			rankMonthlyCategories(transactions, categories, groups, period),
		).toEqual([
			{
				categoryId: 10,
				categoryName: "Mercado",
				groupId: 100,
				groupName: "Essenciais",
				amountCents: 100_00,
				transactionCount: 2,
			},
			{
				categoryId: 12,
				categoryName: "Restaurante",
				groupId: 100,
				groupName: "Essenciais",
				amountCents: 80_00,
				transactionCount: 1,
			},
			{
				categoryId: null,
				categoryName: "Sem categoria",
				groupId: null,
				groupName: "Sem grupo",
				amountCents: 10_00,
				transactionCount: 1,
			},
		]);
		expect(rankMonthlyGroups(transactions, categories, groups, period)).toEqual(
			[
				{
					groupId: 100,
					groupName: "Essenciais",
					amountCents: 180_00,
					transactionCount: 3,
				},
				{
					groupId: null,
					groupName: "Sem grupo",
					amountCents: 10_00,
					transactionCount: 1,
				},
			],
		);
	});

	test("invoice closing day is inclusive", () => {
		expect(getInvoiceForDate("2026-05-10", 10, 20)).toEqual({
			key: "2026-05",
			closingDate: "2026-05-10",
			dueDate: "2026-05-20",
		});
		expect(getInvoiceForDate("2026-05-11", 10, 20)).toEqual({
			key: "2026-06",
			closingDate: "2026-06-10",
			dueDate: "2026-06-20",
		});
	});

	test("classifies budget statuses at exact thresholds", () => {
		expect(classifyBudgetStatus(0, 100_00)).toBe("ok");
		expect(classifyBudgetStatus(79_99, 100_00)).toBe("ok");
		expect(classifyBudgetStatus(80_00, 100_00)).toBe("near");
		expect(classifyBudgetStatus(99_99, 100_00)).toBe("near");
		expect(classifyBudgetStatus(100_00, 100_00)).toBe("over");
		expect(classifyBudgetStatus(120_00, 100_00)).toBe("over");
	});

	test("builds budget usage for month, group and category scopes", () => {
		const period = parseMonthPeriod("2026-05");
		if (period === null) throw new Error("invalid test period");
		const budgets: RuleBudget[] = [
			budget({ id: 1, scope: "month", amountCents: 300_00 }),
			budget({
				id: 2,
				scope: "category_group",
				categoryGroupId: 100,
				amountCents: 200_00,
			}),
			budget({
				id: 3,
				scope: "category",
				categoryId: 10,
				amountCents: 100_00,
			}),
		];

		expect(
			buildBudgetUsage(
				budgets,
				[
					tx({ categoryId: 10, amountCents: 80_00 }),
					tx({ categoryId: 12, amountCents: 40_00 }),
					tx({ categoryId: 11, movementType: "income", amountCents: 500_00 }),
					tx({ categoryId: 10, amountCents: 10_00, status: "planned" }),
					tx({ categoryId: 10, amountCents: 10_00, isArchived: true }),
					tx({ categoryId: 10, amountCents: 10_00, occurredOn: "2026-06-01" }),
				],
				categories,
				groups,
				period,
			).map((row) => ({
				name: row.name,
				plannedCents: row.plannedCents,
				spentCents: row.spentCents,
				status: row.status,
			})),
		).toEqual([
			{
				name: "Mês total",
				plannedCents: 300_00,
				spentCents: 120_00,
				status: "ok",
			},
			{
				name: "Essenciais",
				plannedCents: 200_00,
				spentCents: 120_00,
				status: "ok",
			},
			{
				name: "Mercado",
				plannedCents: 100_00,
				spentCents: 80_00,
				status: "near",
			},
		]);
	});

	test("builds budget history with missing months, gaps and deltas", () => {
		const rows = buildBudgetHistory(
			[
				budget({ monthKey: "2026-01", amountCents: 100_00 }),
				budget({ monthKey: "2026-03", amountCents: 120_00 }),
			],
			[
				tx({ amountCents: 40_00, occurredOn: "2026-01-10" }),
				tx({ amountCents: 70_00, occurredOn: "2026-03-10" }),
			],
			categories,
			groups,
			["2026-03", "2026-02", "2026-01"],
			"month",
			null,
		);

		expect(rows).toEqual([
			{
				deltaPlannedCents: null,
				deltaSpentCents: null,
				monthKey: "2026-01",
				percent: 0.4,
				plannedCents: 100_00,
				spentCents: 40_00,
			},
			{
				deltaPlannedCents: null,
				deltaSpentCents: -40_00,
				monthKey: "2026-02",
				percent: null,
				plannedCents: null,
				spentCents: 0,
			},
			{
				deltaPlannedCents: null,
				deltaSpentCents: 70_00,
				monthKey: "2026-03",
				percent: 70_00 / 120_00,
				plannedCents: 120_00,
				spentCents: 70_00,
			},
		]);
	});

	test("warns when detailed budget sums exceed parent budgets", () => {
		expect(
			summarizeBudgetCoherence(
				[
					budget({ scope: "month", amountCents: 100_00 }),
					budget({
						scope: "category_group",
						categoryGroupId: 100,
						amountCents: 120_00,
					}),
					budget({
						scope: "category",
						categoryId: 10,
						amountCents: 70_00,
					}),
					budget({
						scope: "category",
						categoryId: 12,
						amountCents: 60_00,
					}),
				],
				categories,
			),
		).toEqual([
			"2026-05: soma dos orçamentos de categoria supera o orçamento do grupo 100.",
			"2026-05: soma dos orçamentos detalhados supera o orçamento mensal.",
		]);
	});

	test("lists deterministic month options around a reference date", () => {
		expect(
			listMonthOptions(new Date(2026, 4, 20), 1, 1).map((period) => ({
				key: period.key,
				start: period.start,
			})),
		).toEqual([
			{ key: "2026-04", start: "2026-04-01" },
			{ key: "2026-05", start: "2026-05-01" },
			{ key: "2026-06", start: "2026-06-01" },
		]);
	});
});
