import { describe, expect, test } from "bun:test";

import {
	type AnalysisTransaction,
	buildComparisons,
	buildMonthWindow,
	categoryAnomalies,
	categoryMonthlySeries,
	compareToReference,
	concentrationSummary,
	groupMonthlySeries,
	monthlyTotalsSeries,
	type NamedAccount,
	normalizeDescription,
	rankAccountsByExpense,
	rankDescriptions,
	rankLargestExpenses,
	savingOpportunities,
	smallRecurringDescriptions,
	topCategoryGrowers,
	topCategoryIdsForPeriod,
	topCategoryReducers,
	topGroupIdsForPeriod,
	uncategorizedExpenseStats,
} from "./analysis";
import {
	parseMonthPeriod,
	type RuleCategory,
	type RuleCategoryGroup,
} from "./finance-rules";

const parsedPeriod = parseMonthPeriod("2026-05");
if (!parsedPeriod) throw new Error("invalid test period");
const period = parsedPeriod;
const accounts: NamedAccount[] = [
	{
		id: 1,
		name: "Conta B",
		type: "checking",
		initialBalanceCents: 0,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
	{
		id: 2,
		name: "Cartão",
		type: "credit_card",
		initialBalanceCents: 0,
		creditCardClosingDay: 10,
		creditCardDueDay: 20,
	},
	{
		id: 3,
		name: "Conta A",
		type: "checking",
		initialBalanceCents: 0,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
];
const categories: RuleCategory[] = [
	{ id: 10, groupId: 100, name: "Mercado" },
	{ id: 11, groupId: 100, name: "Restaurante" },
	{ id: 12, groupId: 101, name: "Lazer" },
];
const groups: RuleCategoryGroup[] = [
	{ id: 100, name: "Essenciais" },
	{ id: 101, name: "Variáveis" },
];

function tx(overrides: Partial<AnalysisTransaction>): AnalysisTransaction {
	return {
		accountId: 1,
		destinationAccountId: null,
		categoryId: 10,
		movementType: "expense",
		status: "confirmed",
		amountCents: 1000,
		occurredOn: "2026-05-10",
		isArchived: false,
		description: "Mercado",
		originalDescription: "Mercado",
		...overrides,
	};
}

describe("analysis", () => {
	test("normalizes descriptions", () => {
		expect(normalizeDescription("  Foo\t BAR  baz\n")).toBe("foo bar baz");
		expect(normalizeDescription("   ")).toBe("");
	});

	test("ranks accounts by confirmed expenses including credit cards with tie-breaks", () => {
		const rows = rankAccountsByExpense(
			[
				tx({ accountId: 1, amountCents: 2000 }),
				tx({ accountId: 2, amountCents: 3000 }),
				tx({ accountId: 3, amountCents: 2000 }),
				tx({ accountId: 2, amountCents: 9999, isArchived: true }),
				tx({
					accountId: 2,
					amountCents: 9999,
					movementType: "credit_card_payment",
				}),
			],
			accounts,
			period,
		);
		expect(rows.map((row) => row.accountName)).toEqual([
			"Cartão",
			"Conta A",
			"Conta B",
		]);
		expect(rows[0]?.amountCents).toBe(3000);
	});

	test("groups description variants and picks most common label", () => {
		const rows = rankDescriptions(
			[
				tx({ description: "NETFLIX", amountCents: 1000 }),
				tx({ description: " netflix ", amountCents: 1200 }),
				tx({ description: "Netflix", amountCents: 1300 }),
				tx({ description: "Netflix", amountCents: 500 }),
			],
			period,
		);
		expect(rows[0]).toEqual({
			key: "netflix",
			label: "Netflix",
			amountCents: 4000,
			transactionCount: 4,
		});
	});

	test("ranks largest expenses with limit and ignores planned/archived", () => {
		const rows = rankLargestExpenses(
			[
				tx({ description: "A", amountCents: 1000 }),
				tx({ description: "B", amountCents: 3000 }),
				tx({ description: "C", amountCents: 2000 }),
				tx({ description: "D", amountCents: 9000, status: "planned" }),
				tx({ description: "E", amountCents: 9000, isArchived: true }),
			],
			accounts,
			categories,
			period,
			2,
		);
		expect(rows.map((row) => row.description)).toEqual(["B", "C"]);
	});

	test("builds monthly totals with zero months and alignment", () => {
		const window = buildMonthWindow(period, 3);
		const rows = monthlyTotalsSeries(
			[
				tx({
					occurredOn: "2026-03-01",
					movementType: "income",
					amountCents: 5000,
				}),
				tx({ occurredOn: "2026-05-01", amountCents: 1200 }),
			],
			window,
		);
		expect(rows).toEqual([
			{
				monthKey: "2026-03",
				incomeCents: 5000,
				expenseCents: 0,
				netCents: 5000,
			},
			{ monthKey: "2026-04", incomeCents: 0, expenseCents: 0, netCents: 0 },
			{
				monthKey: "2026-05",
				incomeCents: 0,
				expenseCents: 1200,
				netCents: -1200,
			},
		]);
	});

	test("builds category and group monthly series aligned to selected tops", () => {
		const transactions = [
			tx({ categoryId: 10, amountCents: 4000 }),
			tx({ categoryId: 11, amountCents: 5000 }),
			tx({ categoryId: 12, amountCents: 3000, occurredOn: "2026-04-01" }),
		];
		const window = buildMonthWindow(period, 2);
		expect(
			topCategoryIdsForPeriod(transactions, categories, groups, period, 1),
		).toEqual([11]);
		expect(
			topGroupIdsForPeriod(transactions, categories, groups, period, 1),
		).toEqual([100]);
		expect(
			categoryMonthlySeries(transactions, categories, groups, window, [11])[0]
				?.series,
		).toEqual([
			{ monthKey: "2026-04", amountCents: 0, transactionCount: 0 },
			{ monthKey: "2026-05", amountCents: 5000, transactionCount: 1 },
		]);
		expect(
			groupMonthlySeries(transactions, categories, groups, window, [100])[0]
				?.series[1]?.amountCents,
		).toBe(9000);
	});

	test("compares previous, prior average and year over year", () => {
		const series = [
			{ monthKey: "2025-05", amountCents: 5000 },
			{ monthKey: "2025-12", amountCents: 1000 },
			{ monthKey: "2026-01", amountCents: 2000 },
			{ monthKey: "2026-02", amountCents: 3000 },
			{ monthKey: "2026-03", amountCents: 4000 },
			{ monthKey: "2026-04", amountCents: 0 },
			{ monthKey: "2026-05", amountCents: 10000 },
		];
		expect(compareToReference(1000, 0)).toEqual({
			deltaCents: 1000,
			percent: null,
		});
		const comparisons = buildComparisons(series, period);
		expect(comparisons.previousMonth).toEqual({
			deltaCents: 10000,
			percent: null,
		});
		expect(comparisons.priorFiveAverage).toEqual({
			deltaCents: 8000,
			percent: 4,
		});
		expect(comparisons.sameMonthLastYear).toEqual({
			deltaCents: 5000,
			percent: 1,
		});
		expect(buildComparisons(series.slice(1), period).sameMonthLastYear).toBe(
			null,
		);
	});

	test("finds growers and reducers with baseline floor", () => {
		const history = [
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
			"2026-04",
		].flatMap((month) => [
			tx({ categoryId: 10, occurredOn: `${month}-01`, amountCents: 10000 }),
			tx({ categoryId: 11, occurredOn: `${month}-01`, amountCents: 10000 }),
			tx({ categoryId: 12, occurredOn: `${month}-01`, amountCents: 1000 }),
		]);
		const transactions = [
			...history,
			tx({ categoryId: 10, amountCents: 20000 }),
			tx({ categoryId: 11, amountCents: 5000 }),
			tx({ categoryId: 12, amountCents: 50000 }),
		];
		expect(
			topCategoryGrowers(transactions, categories, groups, period).map(
				(row) => row.categoryName,
			),
		).toEqual(["Mercado"]);
		expect(
			topCategoryReducers(transactions, categories, groups, period).map(
				(row) => row.categoryName,
			),
		).toEqual(["Restaurante"]);
	});

	test("requires anomaly history and threshold breach", () => {
		const transactions = [
			tx({ categoryId: 10, occurredOn: "2026-02-01", amountCents: 10000 }),
			tx({ categoryId: 10, occurredOn: "2026-03-01", amountCents: 10000 }),
			tx({ categoryId: 10, occurredOn: "2026-04-01", amountCents: 10000 }),
			tx({ categoryId: 10, amountCents: 40000 }),
			tx({ categoryId: 11, occurredOn: "2026-04-01", amountCents: 10000 }),
			tx({ categoryId: 11, amountCents: 40000 }),
		];
		expect(
			categoryAnomalies(transactions, categories, groups, period).map(
				(row) => row.categoryName,
			),
		).toEqual(["Mercado"]);
	});

	test("summarizes concentration thresholds", () => {
		expect(
			concentrationSummary([{ amountCents: 4100 }], 10000).isConcentrated,
		).toBe(true);
		expect(concentrationSummary([{ amountCents: 4100 }], 10000).reason).toBe(
			"top1",
		);
		expect(
			concentrationSummary(
				[{ amountCents: 3000 }, { amountCents: 2500 }, { amountCents: 2100 }],
				10000,
			),
		).toEqual({
			topGroupShare: 0.3,
			topThreeShare: 0.76,
			isConcentrated: true,
			reason: "top3",
		});
		expect(
			concentrationSummary(
				[{ amountCents: 4000 }, { amountCents: 2000 }, { amountCents: 1000 }],
				10000,
			),
		).toEqual({
			topGroupShare: 0.4,
			topThreeShare: 0.7,
			isConcentrated: false,
			reason: null,
		});
	});

	test("finds small recurring descriptions only when all thresholds pass", () => {
		const window = buildMonthWindow(period, 6);
		const rows = smallRecurringDescriptions(
			[
				...Array.from({ length: 5 }, (_, index) =>
					tx({
						description: "Café",
						occurredOn: `2026-0${index + 1}-01`,
						amountCents: 4500,
					}),
				),
				...Array.from({ length: 2 }, (_, index) =>
					tx({
						description: "Pouco",
						occurredOn: `2026-0${index + 1}-02`,
						amountCents: 4900,
					}),
				),
				tx({ description: "Grande", amountCents: 6000 }),
			],
			window,
		);
		expect(rows.length).toBe(1);
		expect(rows[0]?.key).toBe("café");
		expect(rows[0]?.totalCents).toBe(22500);
		expect(rows[0]?.occurrenceCount).toBe(5);
		expect(rows[0]?.averageCents).toBe(4500);
	});

	test("deduplicates saving opportunities", () => {
		const rows = savingOpportunities({
			subscriptionsToReview: [
				{ recurrenceId: 1, name: "Netflix", monthlyAmountCents: 3000 },
			],
			growers: [
				{
					categoryId: 10,
					categoryName: "Mercado",
					groupName: "Essenciais",
					currentCents: 1,
					baselineCents: 1,
					deltaCents: 2000,
					percent: 1,
				},
			],
			smallRecurring: [
				{ key: "netflix", label: "Netflix", totalCents: 21000 },
				{ key: "netflix", label: "Netflix", totalCents: 22000 },
			],
		});
		expect(rows.filter((row) => row.key === "description:netflix").length).toBe(
			1,
		);
		expect(
			rows.find((row) => row.key === "description:netflix")?.sources,
		).toEqual(["small_recurring"]);
	});

	test("counts uncategorized confirmed expenses only", () => {
		expect(
			uncategorizedExpenseStats(
				[
					tx({ categoryId: null, amountCents: 1000 }),
					tx({ categoryId: undefined, amountCents: 2000 }),
					tx({ categoryId: null, status: "planned", amountCents: 3000 }),
					tx({ categoryId: null, movementType: "income", amountCents: 4000 }),
				],
				period,
			),
		).toEqual({ count: 2, amountCents: 3000 });
	});
});
