import { describe, expect, test } from "bun:test";

import {
	categoryActionError,
	duplicateCategoryNameMessage,
	isDuplicateCategoryNameError,
} from "./category-errors";

describe("category duplicate errors", () => {
	test("maps category-name unique violations to the PT-BR banner copy", () => {
		const error = {
			code: "23505",
			constraint_name: "finance_app_categories_user_group_name_idx",
		};

		expect(isDuplicateCategoryNameError(error)).toBe(true);
		expect(categoryActionError(error)).toEqual({
			error: duplicateCategoryNameMessage,
		});
	});

	test("accepts the node-postgres constraint property name too", () => {
		expect(
			isDuplicateCategoryNameError({
				code: "23505",
				constraint: "finance_app_categories_user_group_name_idx",
			}),
		).toBe(true);
	});

	test("does not map other database errors", () => {
		expect(
			categoryActionError({
				code: "23505",
				constraint_name: "finance_app_category_groups_user_kind_name_idx",
			}),
		).toBe(null);
		expect(categoryActionError({ code: "23503" })).toBe(null);
	});
});
