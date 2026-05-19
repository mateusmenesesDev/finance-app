import { describe, expect, test } from "bun:test";

import {
	formatConfirmCategoryError,
	type ImportConfirmCategory,
	resolveConfirmRowCategory,
} from "./import-confirm";

const expenseCategory: ImportConfirmCategory = {
	id: 1,
	name: "Mercado",
	kind: "expense",
};
const incomeCategory: ImportConfirmCategory = {
	id: 2,
	name: "Salário",
	kind: "income",
};
const categoriesById = new Map<number, ImportConfirmCategory>([
	[expenseCategory.id, expenseCategory],
	[incomeCategory.id, incomeCategory],
]);

describe("resolveConfirmRowCategory", () => {
	test("uses row-level category when kinds match", () => {
		const result = resolveConfirmRowCategory({
			movementType: "expense",
			rowCategoryId: expenseCategory.id,
			bulkCategoryId: null,
			categoriesById,
		});
		expect(result).toEqual({
			kind: "ok",
			category: expenseCategory,
			usedBulk: false,
		});
	});

	test("flags row-level category when kinds disagree", () => {
		const result = resolveConfirmRowCategory({
			movementType: "income",
			rowCategoryId: expenseCategory.id,
			bulkCategoryId: null,
			categoriesById,
		});
		expect(result).toEqual({
			kind: "mismatch",
			category: expenseCategory,
			source: "row",
		});
	});

	test("falls back to bulk only when bulk kind matches", () => {
		const matchingBulk = resolveConfirmRowCategory({
			movementType: "income",
			rowCategoryId: null,
			bulkCategoryId: incomeCategory.id,
			categoriesById,
		});
		expect(matchingBulk).toEqual({
			kind: "ok",
			category: incomeCategory,
			usedBulk: true,
		});

		const mismatchedBulk = resolveConfirmRowCategory({
			movementType: "income",
			rowCategoryId: null,
			bulkCategoryId: expenseCategory.id,
			categoriesById,
		});
		expect(mismatchedBulk).toEqual({
			kind: "mismatch",
			category: expenseCategory,
			source: "bulk",
		});
	});

	test("reports missing when neither pick resolves", () => {
		expect(
			resolveConfirmRowCategory({
				movementType: "expense",
				rowCategoryId: null,
				bulkCategoryId: null,
				categoriesById,
			}),
		).toEqual({ kind: "missing" });

		expect(
			resolveConfirmRowCategory({
				movementType: "expense",
				rowCategoryId: 999,
				bulkCategoryId: null,
				categoriesById,
			}),
		).toEqual({ kind: "missing" });
	});
});

describe("formatConfirmCategoryError", () => {
	test("explains row-level kind mismatch with category name", () => {
		const message = formatConfirmCategoryError(
			{ kind: "mismatch", category: expenseCategory, source: "row" },
			"income",
		);
		expect(message).toContain("Mercado");
		expect(message).toContain("despesa");
		expect(message).toContain("receita");
	});

	test("explains that the bulk fallback was skipped", () => {
		const message = formatConfirmCategoryError(
			{ kind: "mismatch", category: incomeCategory, source: "bulk" },
			"expense",
		);
		expect(message).toContain("lote");
		expect(message).toContain("Salário");
		expect(message).toContain("despesa");
	});

	test("explains missing category", () => {
		const message = formatConfirmCategoryError({ kind: "missing" }, "expense");
		expect(message).toContain("Selecione");
		expect(message).toContain("despesa");
	});
});
