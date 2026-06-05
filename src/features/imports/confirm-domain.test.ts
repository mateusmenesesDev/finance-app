import { describe, expect, test } from "bun:test";

import {
	confirmCategoryMovementType,
	formatConfirmCategoryError,
	type ImportConfirmCategory,
	isCardImportRow,
	resolveCardImportConfirm,
	resolveConfirmRowCategory,
} from "./confirm-domain";

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

	test("transfer rows do not need category", () => {
		expect(
			resolveConfirmRowCategory({
				movementType: "transfer",
				rowCategoryId: null,
				bulkCategoryId: null,
				categoriesById,
			}),
		).toEqual({
			kind: "ok",
			category: { id: 0, name: "Transferência", kind: "transfer" },
			usedBulk: false,
		});
	});

	test("credit card payment rows do not need category", () => {
		expect(
			resolveConfirmRowCategory({
				movementType: "credit_card_payment",
				rowCategoryId: null,
				bulkCategoryId: null,
				categoriesById,
			}),
		).toEqual({
			kind: "ok",
			category: {
				id: 0,
				name: "Pagamento de fatura",
				kind: "credit_card_payment",
			},
			usedBulk: false,
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

describe("resolveCardImportConfirm", () => {
	const cardRow = { cardId: 1, cardInvoiceId: 10 };
	const bankRow = { cardId: null, cardInvoiceId: null };

	test("bank rows are not card entries", () => {
		expect(
			resolveCardImportConfirm({ movementType: "expense", row: bankRow }),
		).toEqual({ kind: "not_card" });
	});

	test("card charges skip account and store as charge", () => {
		expect(
			resolveCardImportConfirm({ movementType: "expense", row: cardRow }),
		).toEqual({
			kind: "card_entry",
			skipsAccountId: true,
			storedMovementType: "expense",
			cardEntryKind: "charge",
			categoryMovementType: "expense",
		});
	});

	test("card statement credits skip account and store as credit", () => {
		expect(
			resolveCardImportConfirm({ movementType: "income", row: cardRow }),
		).toEqual({
			kind: "card_entry",
			skipsAccountId: true,
			storedMovementType: "expense",
			cardEntryKind: "credit",
			categoryMovementType: "expense",
		});
	});

	test("transfer-like card rows still need accounts", () => {
		expect(
			resolveCardImportConfirm({ movementType: "transfer", row: cardRow }),
		).toEqual({ kind: "card_transfer_like" });
		expect(
			resolveCardImportConfirm({
				movementType: "credit_card_payment",
				row: cardRow,
			}),
		).toEqual({ kind: "card_transfer_like" });
	});
});

describe("confirmCategoryMovementType", () => {
	test("maps card credits to expense categories", () => {
		expect(
			confirmCategoryMovementType("income", {
				cardId: 1,
				cardInvoiceId: 10,
			}),
		).toBe("expense");
		expect(
			confirmCategoryMovementType("expense", {
				cardId: null,
				cardInvoiceId: null,
			}),
		).toBe("expense");
	});
});

describe("isCardImportRow", () => {
	test("requires both card and invoice ids", () => {
		expect(isCardImportRow({ cardId: 1, cardInvoiceId: 2 })).toBe(true);
		expect(isCardImportRow({ cardId: 1, cardInvoiceId: null })).toBe(false);
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
