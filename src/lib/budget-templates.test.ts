import { describe, expect, test } from "bun:test";

import {
	buildMaterializedBudgetInserts,
	monthKeysBetween,
	monthKeysForDateRange,
} from "./budget-templates";

describe("budget templates", () => {
	test("materializes a recurring budget when a month is opened", () => {
		expect(
			buildMaterializedBudgetInserts({
				existingBudgets: [],
				monthKeys: ["2026-05"],
				skips: [],
				templates: [
					{
						id: 1,
						scope: "category",
						categoryGroupId: null,
						categoryId: 10,
						amountCents: 200_00,
						startsAtMonthKey: "2026-05",
						isArchived: false,
					},
				],
				userId: "u1",
			}),
		).toEqual([
			{
				amountCents: 200_00,
				categoryGroupId: null,
				categoryId: 10,
				monthKey: "2026-05",
				scope: "category",
				templateId: 1,
				userId: "u1",
			},
		]);
	});

	test("does not overwrite an existing monthly budget", () => {
		expect(
			buildMaterializedBudgetInserts({
				existingBudgets: [
					{
						monthKey: "2026-05",
						scope: "category",
						categoryGroupId: null,
						categoryId: 10,
					},
				],
				monthKeys: ["2026-05"],
				skips: [],
				templates: [
					{
						id: 1,
						scope: "category",
						categoryGroupId: null,
						categoryId: 10,
						amountCents: 200_00,
						startsAtMonthKey: "2026-05",
						isArchived: false,
					},
				],
				userId: "u1",
			}),
		).toEqual([]);
	});

	test("respects skipped months for a recurring budget", () => {
		expect(
			buildMaterializedBudgetInserts({
				existingBudgets: [],
				monthKeys: ["2026-05", "2026-06"],
				skips: [{ templateId: 1, monthKey: "2026-05" }],
				templates: [
					{
						id: 1,
						scope: "category",
						categoryGroupId: null,
						categoryId: 10,
						amountCents: 200_00,
						startsAtMonthKey: "2026-05",
						isArchived: false,
					},
				],
				userId: "u1",
			}),
		).toEqual([
			{
				amountCents: 200_00,
				categoryGroupId: null,
				categoryId: 10,
				monthKey: "2026-06",
				scope: "category",
				templateId: 1,
				userId: "u1",
			},
		]);
	});

	test("materializes every month required by a report range", () => {
		const monthKeys = monthKeysForDateRange({
			from: "2026-01-15",
			to: "2026-03-20",
		});
		expect(monthKeys).toEqual(["2026-01", "2026-02", "2026-03"]);
		expect(monthKeysBetween("2026-01", "2026-03")).toEqual(monthKeys);
		expect(
			buildMaterializedBudgetInserts({
				existingBudgets: [],
				monthKeys,
				skips: [],
				templates: [
					{
						id: 1,
						scope: "month",
						categoryGroupId: null,
						categoryId: null,
						amountCents: 800_00,
						startsAtMonthKey: "2026-01",
						isArchived: false,
					},
				],
				userId: "u1",
			}).map((row) => row.monthKey),
		).toEqual(["2026-01", "2026-02", "2026-03"]);
	});
});
