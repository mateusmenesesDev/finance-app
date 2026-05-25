import { describe, expect, test } from "bun:test";

import { normalizeBudgetScopeSelection } from "./budget-form";

describe("budget form selection", () => {
	test("month scope ignores group and category ids", () => {
		expect(
			normalizeBudgetScopeSelection("month", {
				categoryGroupId: 100,
				categoryId: 10,
			}),
		).toEqual({
			categoryGroupId: null,
			categoryId: null,
		});
	});

	test("group scope keeps only the group id", () => {
		expect(
			normalizeBudgetScopeSelection("category_group", {
				categoryGroupId: 100,
				categoryId: 10,
			}),
		).toEqual({
			categoryGroupId: 100,
			categoryId: null,
		});
	});

	test("category scope keeps only the category id", () => {
		expect(
			normalizeBudgetScopeSelection("category", {
				categoryGroupId: 100,
				categoryId: 10,
			}),
		).toEqual({
			categoryGroupId: null,
			categoryId: 10,
		});
	});
});
