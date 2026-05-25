import { describe, expect, test } from "bun:test";

import {
	buildBudgetHistory,
	buildBudgetUsage,
	calculateAccountBalances,
	calculateMonthlyBalanceTotals,
	calculateMonthlyTotals,
	calculateMonthlyTotalsByCashFlowRole,
	calculateWealthSummary,
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
	{
		id: 4,
		type: "investment",
		initialBalanceCents: 200_00,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
];

const categories: RuleCategory[] = [
	{ id: 10, groupId: 100, name: "Mercado" },
	{ id: 11, groupId: 101, name: "Salário" },
	{ id: 12, groupId: 100, name: "Restaurante" },
	{ id: 13, groupId: 102, name: "Rendimentos" },
];

const groups: RuleCategoryGroup[] = [
	{ id: 100, name: "Essenciais" },
	{ id: 101, name: "Renda", cashFlowRole: "operational" },
	{ id: 102, name: "Rendimentos financeiros", cashFlowRole: "financial" },
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

	test("wealth summary separates available cash from investments", () => {
		const summary = calculateWealthSummary(accounts, [
			tx({ movementType: "income", amountCents: 100_00 }),
			tx({
				movementType: "transfer",
				amountCents: 50_00,
				destinationAccountId: 4,
			}),
			tx({ accountId: 2, movementType: "expense", amountCents: 30_00 }),
		]);

		expect(summary).toEqual({
			availableCashCents: 150_00,
			investmentCents: 250_00,
			cardDebtCents: 30_00,
			totalWealthCents: 370_00,
		});
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

	test("monthly totals can separate main and financial income", () => {
		const period = parseMonthPeriod("2026-05");
		if (period === null) throw new Error("invalid test period");

		expect(
			calculateMonthlyTotalsByCashFlowRole(
				[
					tx({ categoryId: 11, movementType: "income", amountCents: 300_00 }),
					tx({ categoryId: 13, movementType: "income", amountCents: 20_00 }),
					tx({ movementType: "expense", amountCents: 120_00 }),
					tx({ movementType: "transfer", amountCents: 90_00 }),
				],
				categories,
				groups,
				period,
			),
		).toEqual({
			mainIncomeCents: 300_00,
			financialIncomeCents: 20_00,
			incomeCents: 320_00,
			expenseCents: 120_00,
			netCents: 200_00,
			transactionCount: 3,
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

	describe("calculateMonthlyBalanceTotals", () => {
		const period = parseMonthPeriod("2026-05");
		if (!period) throw new Error("invalid test period");

		test("credit card expense is excluded from cashExpenseCents and netCents", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({ accountId: 2, movementType: "expense", amountCents: 200_00 }),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.cashExpenseCents).toBe(0);
			expect(result.invoicePaymentCents).toBe(0);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(500_00);
		});

		test("bank expense counts as cashExpenseCents and reduces netCents", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({ accountId: 1, movementType: "expense", amountCents: 150_00 }),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.cashExpenseCents).toBe(150_00);
			expect(result.invoicePaymentCents).toBe(0);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(350_00);
		});

		test("credit_card_payment counts as invoicePaymentCents and reduces netCents", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({
						movementType: "credit_card_payment",
						amountCents: 200_00,
						destinationAccountId: 2,
					}),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.cashExpenseCents).toBe(0);
			expect(result.invoicePaymentCents).toBe(200_00);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(300_00);
		});

		test("netCents = income - cashExpenses - invoicePayments (mixed scenario)", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({ accountId: 1, movementType: "expense", amountCents: 100_00 }),
					tx({ accountId: 2, movementType: "expense", amountCents: 300_00 }),
					tx({
						movementType: "credit_card_payment",
						amountCents: 200_00,
						destinationAccountId: 2,
					}),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.cashExpenseCents).toBe(100_00);
			expect(result.invoicePaymentCents).toBe(200_00);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(200_00);
		});

		test("expenseCents equals cashExpenseCents plus invoicePaymentCents", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ accountId: 1, movementType: "expense", amountCents: 100_00 }),
					tx({
						movementType: "credit_card_payment",
						amountCents: 200_00,
						destinationAccountId: 2,
					}),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.expenseCents).toBe(
				result.cashExpenseCents + result.invoicePaymentCents,
			);
		});

		test("separates main and financial income like the spending version", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ categoryId: 11, movementType: "income", amountCents: 300_00 }),
					tx({ categoryId: 13, movementType: "income", amountCents: 20_00 }),
				],
				categories,
				groups,
				period,
				accounts,
			);
			expect(result.mainIncomeCents).toBe(300_00);
			expect(result.financialIncomeCents).toBe(20_00);
		});

		test("ignores planned and archived transactions", () => {
			const result = calculateMonthlyBalanceTotals(
				[
					tx({ movementType: "income", amountCents: 100_00 }),
					tx({
						movementType: "expense",
						amountCents: 50_00,
						status: "planned",
					}),
					tx({
						movementType: "expense",
						amountCents: 50_00,
						isArchived: true,
					}),
				],
				[],
				[],
				period,
				accounts,
			);
			expect(result.cashExpenseCents).toBe(0);
			expect(result.invoicePaymentCents).toBe(0);
			expect(result.incomeCents).toBe(100_00);
			expect(result.netCents).toBe(100_00);
		});
	});

	describe("calculateMonthlyTotalsByCashFlowRole (spending analysis — unchanged)", () => {
		const period = parseMonthPeriod("2026-05");
		if (!period) throw new Error("invalid test period");

		test("card expense still counts in expenseCents for spending analysis", () => {
			const result = calculateMonthlyTotalsByCashFlowRole(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({ accountId: 2, movementType: "expense", amountCents: 200_00 }),
				],
				[],
				[],
				period,
			);
			expect(result.expenseCents).toBe(200_00);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(300_00);
		});

		test("credit_card_payment is excluded from spending analysis", () => {
			const result = calculateMonthlyTotalsByCashFlowRole(
				[
					tx({ movementType: "income", amountCents: 500_00 }),
					tx({
						movementType: "credit_card_payment",
						amountCents: 200_00,
						destinationAccountId: 2,
					}),
				],
				[],
				[],
				period,
			);
			expect(result.expenseCents).toBe(0);
			expect(result.incomeCents).toBe(500_00);
			expect(result.netCents).toBe(500_00);
		});
	});

	describe("rankings and budgets use spending analysis (card expenses by month)", () => {
		const period = parseMonthPeriod("2026-05");
		if (!period) throw new Error("invalid test period");

		test("rankMonthlyCategories includes credit card expenses", () => {
			const result = rankMonthlyCategories(
				[
					tx({ accountId: 2, categoryId: 10, amountCents: 150_00 }),
					tx({ accountId: 1, categoryId: 12, amountCents: 50_00 }),
				],
				categories,
				groups,
				period,
			);
			expect(result.find((r) => r.categoryId === 10)?.amountCents).toBe(
				150_00,
			);
		});

		test("buildBudgetUsage includes credit card expenses", () => {
			const result = buildBudgetUsage(
				[budget({ scope: "month", amountCents: 500_00 })],
				[
					tx({ accountId: 2, categoryId: 10, amountCents: 200_00 }),
					tx({ accountId: 1, categoryId: 12, amountCents: 100_00 }),
				],
				categories,
				groups,
				period,
			);
			expect(result[0]?.spentCents).toBe(300_00);
		});
	});
});
