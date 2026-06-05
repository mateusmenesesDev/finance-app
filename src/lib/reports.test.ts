import { describe, expect, test } from "bun:test";
import type {
	RuleBudget,
	RuleCategory,
	RuleCategoryGroup,
	RuleTransaction,
} from "./finance-rules";
import {
	applyTransactionFilters,
	budgetVsActual,
	columnDate,
	columnMoney,
	columnText,
	granularityWarning,
	incomeExpenseSeries,
	parseReportFilters,
	serializeCsv,
	suggestGranularity,
} from "./reports";

const tx = (overrides: Partial<RuleTransaction>): RuleTransaction => ({
	accountId: 1,
	amountCents: 1000,
	categoryId: 1,
	destinationAccountId: null,
	isArchived: false,
	movementType: "expense",
	occurredOn: "2026-01-10",
	status: "confirmed",
	...overrides,
});

describe("reports", () => {
	test("parse date range, numeric guards and interval validation", () => {
		const filters = parseReportFilters(
			{
				startDate: "2026-04-01",
				endDate: "2026-05-10",
				accountId: "2",
				groupId: "x",
				granularity: "week",
			},
			"2026-05-10",
		);
		expect(filters.from).toBe("2026-04-01");
		expect(filters.to).toBe("2026-05-10");
		expect(filters.accountId).toBe(2);
		expect(filters.groupId).toBe(undefined);
		expect(filters.granularity).toBe("week");
		let failed = false;
		try {
			parseReportFilters(
				{ startDate: "2026-02-01", endDate: "2026-01-01" },
				"2026-05-10",
			);
		} catch {
			failed = true;
		}
		expect(failed).toBe(true);
	});

	test("keeps legacy preset and from/to query params", () => {
		const presetFilters = parseReportFilters(
			{ preset: "last_30d" },
			"2026-05-10",
		);
		expect(presetFilters.from).toBe("2026-04-11");
		expect(presetFilters.to).toBe("2026-05-10");
		const customFilters = parseReportFilters(
			{ preset: "custom", from: "2026-02-01", to: "2026-02-28" },
			"2026-05-10",
		);
		expect(customFilters.from).toBe("2026-02-01");
		expect(customFilters.to).toBe("2026-02-28");
	});

	test("suggestGranularity covers limits", () => {
		expect(suggestGranularity({ from: "2026-01-01", to: "2026-03-01" })).toBe(
			"day",
		);
		expect(suggestGranularity({ from: "2026-01-01", to: "2026-06-29" })).toBe(
			"week",
		);
		expect(suggestGranularity({ from: "2026-01-01", to: "2027-06-24" })).toBe(
			"month",
		);
		expect(suggestGranularity({ from: "2026-01-01", to: "2027-06-25" })).toBe(
			"year",
		);
	});

	test("granularityWarning reports extremes", () => {
		expect(
			granularityWarning({ from: "2026-01-01", to: "2026-01-01" }, "day"),
		).toContain("poucos");
		expect(
			granularityWarning({ from: "2026-01-01", to: "2026-06-01" }, "day"),
		).toContain("muitos");
		expect(
			granularityWarning({ from: "2026-01-01", to: "2026-03-01" }, "week"),
		).toBe(null);
	});

	test("income expense buckets across year and ignores non confirmed", () => {
		const rows = incomeExpenseSeries(
			[
				tx({
					movementType: "income",
					occurredOn: "2025-12-31",
					amountCents: 500,
				}),
				tx({ occurredOn: "2026-01-01", amountCents: 300 }),
				tx({ status: "pending_review", amountCents: 999 }),
				tx({ status: "ignored", amountCents: 999 }),
				tx({ status: "duplicate", amountCents: 999 }),
			],
			{ from: "2025-12-30", to: "2026-01-02" },
			"day",
		);
		expect(rows.map((row) => row.key)).toEqual([
			"2025-12-30",
			"2025-12-31",
			"2026-01-01",
			"2026-01-02",
		]);
		expect(rows.reduce((sum, row) => sum + row.incomeCents, 0)).toBe(500);
		expect(rows.reduce((sum, row) => sum + row.expenseCents, 0)).toBe(300);
	});

	test("income expense buckets split financial income by category group role", () => {
		const rows = incomeExpenseSeries(
			[
				tx({ categoryId: 2, movementType: "income", amountCents: 500 }),
				tx({ categoryId: 3, movementType: "income", amountCents: 75 }),
				tx({ movementType: "expense", amountCents: 300 }),
				tx({ movementType: "transfer", amountCents: 900 }),
			],
			{ from: "2026-01-01", to: "2026-01-31" },
			"month",
			[
				{ id: 2, groupId: 10, name: "Salário" },
				{ id: 3, groupId: 11, name: "Rendimentos" },
			],
			[
				{ id: 10, name: "Renda", cashFlowRole: "operational" },
				{ id: 11, name: "Financeira", cashFlowRole: "financial" },
			],
		);

		expect(rows[0]?.mainIncomeCents).toBe(500);
		expect(rows[0]?.financialIncomeCents).toBe(75);
		expect(rows[0]?.incomeCents).toBe(575);
		expect(rows[0]?.expenseCents).toBe(300);
		expect(rows[0]?.netCents).toBe(275);
	});

	test("combined filters include transfer destination and category group index", () => {
		const filters = parseReportFilters(
			{
				startDate: "2026-01-01",
				endDate: "2026-01-31",
				accountId: "2",
				groupId: "9",
				type: "transfer",
				granularity: "month",
			},
			"2026-01-10",
		);
		const rows = applyTransactionFilters(
			[
				tx({
					movementType: "transfer",
					accountId: 1,
					destinationAccountId: 2,
					categoryId: 3,
				}),
				tx({
					movementType: "transfer",
					accountId: 1,
					destinationAccountId: 4,
					categoryId: 3,
				}),
				tx({
					movementType: "transfer",
					accountId: 1,
					destinationAccountId: 2,
					categoryId: 4,
				}),
			],
			filters,
			new Map([
				[3, 9],
				[4, 8],
			]),
		);
		expect(rows).toHaveLength(1);
	});

	test("budget includes months intersecting range", () => {
		const categories: RuleCategory[] = [{ id: 1, groupId: 1, name: "Mercado" }];
		const groups: RuleCategoryGroup[] = [{ id: 1, name: "Casa" }];
		const budgets: RuleBudget[] = [
			{
				id: 1,
				monthKey: "2026-01",
				scope: "month",
				categoryGroupId: null,
				categoryId: null,
				amountCents: 10000,
			},
			{
				id: 2,
				monthKey: "2026-02",
				scope: "month",
				categoryGroupId: null,
				categoryId: null,
				amountCents: 20000,
			},
		];
		const rows = budgetVsActual(
			[tx({ occurredOn: "2026-02-01", amountCents: 500 })],
			budgets,
			categories,
			groups,
			{ from: "2026-01-31", to: "2026-02-01" },
		);
		expect(rows.map((row) => row.monthKey)).toEqual(["2026-01", "2026-02"]);
	});

	test("CSV BR has BOM, semicolon, dates, money and escaping", () => {
		const csv = serializeCsv(
			[{ name: 'A; "B"\nC', date: "2026-01-02", cents: 1234 }],
			[
				columnText("Nome", (r) => r.name),
				columnDate("Data", (r) => r.date),
				columnMoney("Valor", (r) => r.cents),
			],
		);
		expect(csv.startsWith("\uFEFFNome;Data;Valor\r\n")).toBe(true);
		expect(csv).toContain('"A; ""B""\nC";02/01/2026;12,34');
	});
});
