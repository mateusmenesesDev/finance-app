import { describe, expect, test } from "bun:test";

import {
	buildImportBatchRows,
	type ExistingImportTransaction,
} from "./batch-domain";
import type { ImportCategoryRule } from "./category-rules";
import type { ParsedImportRow } from "./csv-domain";

const baseRow: ParsedImportRow = {
	rowNumber: 2,
	occurredOn: "2026-05-05",
	amountCents: 1234,
	movementType: "expense",
	originalDescription: "Mercado 123456789",
	normalizedDescription: "mercado #",
	externalId: null,
	bankCategory: null,
	validationError: null,
	hadSensitiveData: true,
	parsedData: {
		date: "2026-05-05",
		amount: "-12,34",
		kind: null,
		notes: null,
		hadSensitiveData: true,
	},
};

const recurrenceContext = {
	activeRecurrences: [],
	confirmedOccurrences: [],
};

describe("buildImportBatchRows", () => {
	test("flags duplicates in file, existing transactions, and active previous imports", () => {
		const existingTransactions: ExistingImportTransaction[] = [
			{
				accountId: 1,
				occurredOn: "2026-05-05",
				amountCents: 1234,
				movementType: "expense",
				externalId: null,
				originalDescription: "Mercado 987654321",
				description: "Mercado",
			},
		];
		const previousRow = {
			batchId: 9,
			accountId: 1,
			status: "pending_review",
			occurredOn: "2026-05-06",
			amountCents: 4321,
			movementType: "expense",
			externalId: null,
			normalizedDescription: "padaria #",
		};

		const result = buildImportBatchRows({
			userId: "user-1",
			batchId: 10,
			accountId: 1,
			parsedRows: [
				baseRow,
				{ ...baseRow, rowNumber: 3 },
				{
					...baseRow,
					rowNumber: 4,
					occurredOn: "2026-05-06",
					amountCents: 4321,
					originalDescription: "Padaria 111111111",
					normalizedDescription: "padaria #",
				},
			],
			existingTransactions,
			previousImportRows: [previousRow],
			previousActiveBatchIds: new Set([9]),
			rules: [],
			recurrenceContext,
		});

		expect(result.rowValues.map((row) => row.status)).toEqual([
			"duplicate",
			"duplicate",
			"duplicate",
		]);
		expect(result.rowValues.map((row) => row.validationError)).toEqual([
			"possível duplicidade com transação existente",
			"possível duplicidade no arquivo",
			"possível duplicidade com importação anterior",
		]);
	});

	test("applies import rule suggestions only to pending review rows", () => {
		const rule: ImportCategoryRule = {
			id: 7,
			action: "categorize",
			categoryId: 3,
			accountId: 1,
			movementType: "expense",
			normalizedDescription: "mercado",
			textMatchMode: "contains",
			amountCents: null,
			amountToleranceCents: null,
			descriptionOverride: null,
			priority: 0,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};

		const result = buildImportBatchRows({
			userId: "user-1",
			batchId: 10,
			accountId: 1,
			parsedRows: [
				baseRow,
				{
					...baseRow,
					rowNumber: 3,
					occurredOn: null,
					validationError: "data inválida",
				},
			],
			existingTransactions: [],
			previousImportRows: [],
			previousActiveBatchIds: new Set(),
			rules: [rule],
			recurrenceContext,
		});

		expect(result.suggestionCount).toBe(1);
		expect(result.suggestedRuleMatchCounts.get(7)).toBe(1);
		expect({
			status: result.rowValues[0]?.status,
			suggestedCategoryId: result.rowValues[0]?.suggestedCategoryId,
			suggestedRuleId: result.rowValues[0]?.suggestedRuleId,
			suggestionSource: result.rowValues[0]?.suggestionSource,
		}).toEqual({
			status: "pending_review",
			suggestedCategoryId: 3,
			suggestedRuleId: 7,
			suggestionSource: "rule",
		});
		expect({
			status: result.rowValues[1]?.status,
			suggestedCategoryId: result.rowValues[1]?.suggestedCategoryId,
			suggestedRuleId: result.rowValues[1]?.suggestedRuleId,
			suggestionSource: result.rowValues[1]?.suggestionSource,
		}).toEqual({
			status: "invalid",
			suggestedCategoryId: null,
			suggestedRuleId: null,
			suggestionSource: null,
		});
	});
});
