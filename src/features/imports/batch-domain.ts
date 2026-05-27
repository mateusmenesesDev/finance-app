import {
	type ConfirmedOccurrenceKey,
	matchImportedRowToRecurrence,
	type RecurrenceInput,
} from "~/lib/recurrences";

import {
	type ImportCategoryRule,
	matchImportCategoryRule,
} from "./category-rules";
import {
	duplicateKey,
	normalizeDescription,
	type ParsedImportRow,
} from "./csv-domain";

export type ExistingImportTransaction = {
	accountId: number | null;
	cardInvoiceId?: number | null;
	occurredOn: string;
	amountCents: number;
	movementType: string;
	externalId: string | null;
	originalDescription: string | null;
	description: string;
};

export type PreviousImportRow = {
	batchId: number;
	accountId: number | null;
	cardInvoiceId?: number | null;
	status: string;
	occurredOn: string | null;
	amountCents: number | null;
	movementType: string | null;
	externalId: string | null;
	normalizedDescription: string | null;
};

export type ImportRowInsert = {
	userId: string;
	batchId: number;
	accountId: number | null;
	cardId?: number | null;
	cardInvoiceId?: number | null;
	rowNumber: number;
	status: "invalid" | "duplicate" | "pending_review";
	occurredOn: string | null;
	amountCents: number | null;
	movementType: "income" | "expense" | null;
	originalDescription: string;
	normalizedDescription: string;
	externalId: string | null;
	bankCategory: string | null;
	suggestedCategoryId: number | null;
	suggestedSourceAccountId: number | null | undefined;
	suggestedDestinationAccountId: number | null | undefined;
	suggestedRuleId: number | null;
	suggestedRecurrenceId: number | null;
	suggestedRecurrenceOccurrenceOn: string | null;
	suggestionSource: "rule" | "rule_ignore" | null;
	validationError: string | null;
	parsedData: Record<string, string | boolean | null>;
};

export type BuildImportBatchRowsInput = {
	userId: string;
	batchId: number;
	accountId: number | null;
	cardId?: number | null;
	cardInvoiceId?: number | null;
	parsedRows: ParsedImportRow[];
	existingTransactions: ExistingImportTransaction[];
	previousImportRows: PreviousImportRow[];
	previousActiveBatchIds: Set<number>;
	rules: ImportCategoryRule[];
	recurrenceContext: {
		activeRecurrences: RecurrenceInput[];
		confirmedOccurrences: ConfirmedOccurrenceKey[];
	};
};

export function buildImportBatchRows(input: BuildImportBatchRowsInput) {
	const existingKeys = new Set(
		input.existingTransactions.flatMap((row) => {
			const scopeId = row.accountId ?? invoiceDuplicateScope(row.cardInvoiceId);
			if (
				scopeId === null ||
				(row.movementType !== "income" && row.movementType !== "expense")
			) {
				return [];
			}
			return duplicateKey({
				accountId: scopeId,
				occurredOn: row.occurredOn,
				amountCents: row.amountCents,
				movementType: row.movementType as "income" | "expense",
				externalId: row.externalId,
				normalizedDescription: normalizeDescription(
					row.originalDescription ?? row.description,
				),
			});
		}),
	);
	const previousImportKeys = new Set(
		input.previousImportRows.flatMap((row) => {
			const scopeId = row.accountId ?? invoiceDuplicateScope(row.cardInvoiceId);
			if (
				!input.previousActiveBatchIds.has(row.batchId) ||
				row.status === "ignored" ||
				row.status === "invalid" ||
				scopeId === null ||
				!row.occurredOn ||
				!row.amountCents ||
				(row.movementType !== "income" && row.movementType !== "expense")
			) {
				return [];
			}
			return duplicateKey({
				accountId: scopeId,
				occurredOn: row.occurredOn,
				amountCents: row.amountCents,
				movementType: row.movementType,
				externalId: row.externalId,
				normalizedDescription: row.normalizedDescription ?? "",
			});
		}),
	);
	const fileKeys = new Set<string>();
	const suggestedRuleMatchCounts = new Map<number, number>();
	let suggestionCount = 0;
	const rowValues: ImportRowInsert[] = input.parsedRows.map((row) => {
		let rowStatus: "invalid" | "duplicate" | "pending_review" =
			row.validationError ? "invalid" : "pending_review";
		let duplicateReason: string | null = null;
		const duplicateScopeId =
			input.accountId ?? invoiceDuplicateScope(input.cardInvoiceId);
		if (
			duplicateScopeId !== null &&
			row.occurredOn &&
			row.amountCents &&
			row.movementType
		) {
			const key = duplicateKey({
				accountId: duplicateScopeId,
				occurredOn: row.occurredOn,
				amountCents: row.amountCents,
				movementType: row.movementType,
				externalId: row.externalId,
				normalizedDescription: row.normalizedDescription,
			});
			if (fileKeys.has(key))
				duplicateReason = "possível duplicidade no arquivo";
			else if (existingKeys.has(key)) {
				duplicateReason = "possível duplicidade com transação existente";
			} else if (previousImportKeys.has(key)) {
				duplicateReason = "possível duplicidade com importação anterior";
			}
			fileKeys.add(key);
		}
		if (duplicateReason) rowStatus = "duplicate";
		const suggestion =
			rowStatus === "pending_review" && input.accountId !== null
				? matchImportCategoryRule(
						{ ...row, accountId: input.accountId },
						input.rules,
					)
				: null;
		if (suggestion) {
			suggestionCount++;
			suggestedRuleMatchCounts.set(
				suggestion.id,
				(suggestedRuleMatchCounts.get(suggestion.id) ?? 0) + 1,
			);
		}
		const isIgnoreRule = suggestion?.action === "ignore";
		const isTransferRule = suggestion?.action === "transfer";
		return {
			userId: input.userId,
			batchId: input.batchId,
			accountId: input.accountId,
			cardId: input.cardId ?? null,
			cardInvoiceId: input.cardInvoiceId ?? null,
			rowNumber: row.rowNumber,
			status: rowStatus,
			occurredOn: row.occurredOn,
			amountCents: row.amountCents,
			movementType: row.movementType,
			originalDescription: row.originalDescription,
			normalizedDescription: row.normalizedDescription,
			externalId: row.externalId,
			bankCategory: row.bankCategory,
			suggestedCategoryId:
				isIgnoreRule || isTransferRule
					? null
					: (suggestion?.categoryId ?? null),
			suggestedSourceAccountId: isTransferRule
				? suggestion.sourceAccountId
				: null,
			suggestedDestinationAccountId: isTransferRule
				? suggestion.destinationAccountId
				: null,
			suggestedRuleId: suggestion?.id ?? null,
			suggestedRecurrenceId: null,
			suggestedRecurrenceOccurrenceOn: null,
			suggestionSource: suggestion
				? isIgnoreRule
					? "rule_ignore"
					: "rule"
				: null,
			validationError:
				[row.validationError, duplicateReason].filter(Boolean).join("; ") ||
				null,
			parsedData: row.parsedData,
		} satisfies ImportRowInsert;
	});

	const suggestedOccurrences = [
		...input.recurrenceContext.confirmedOccurrences,
	];
	const rankedRecurrenceRows = rowValues
		.map((row, index) => {
			const amountCents = row.amountCents;
			const match =
				row.status === "pending_review" &&
				row.suggestionSource !== "rule_ignore" &&
				row.accountId !== null &&
				row.occurredOn &&
				amountCents &&
				(row.movementType === "income" || row.movementType === "expense")
					? matchImportedRowToRecurrence(
							{
								accountId: row.accountId,
								movementType: row.movementType,
								amountCents,
								occurredOn: row.occurredOn,
							},
							input.recurrenceContext.activeRecurrences,
							input.recurrenceContext.confirmedOccurrences,
							row.occurredOn,
						)
					: null;
			const occurrence = match
				? input.recurrenceContext.activeRecurrences.find(
						(recurrence) => recurrence.id === match.recurrenceId,
					)
				: null;
			if (!match || !occurrence || !amountCents) return null;
			return {
				index,
				dayDelta: Math.abs(
					Date.parse(`${row.occurredOn}T00:00:00Z`) -
						Date.parse(`${match.occurrenceOn}T00:00:00Z`),
				),
				valueDelta: Math.abs(amountCents - occurrence.amountCents),
			};
		})
		.filter((row) => row !== null)
		.sort(
			(left, right) =>
				left.dayDelta - right.dayDelta ||
				left.valueDelta - right.valueDelta ||
				(rowValues[left.index]?.rowNumber ?? 0) -
					(rowValues[right.index]?.rowNumber ?? 0),
		);
	for (const ranked of rankedRecurrenceRows) {
		const row = rowValues[ranked.index];
		if (!row) continue;
		const amountCents = row.amountCents;
		const recurrenceSuggestion =
			row.accountId !== null &&
			row.occurredOn &&
			amountCents &&
			(row.movementType === "income" || row.movementType === "expense")
				? matchImportedRowToRecurrence(
						{
							accountId: row.accountId,
							movementType: row.movementType,
							amountCents,
							occurredOn: row.occurredOn,
						},
						input.recurrenceContext.activeRecurrences,
						suggestedOccurrences,
						row.occurredOn,
					)
				: null;
		if (!recurrenceSuggestion) continue;
		row.suggestedRecurrenceId = recurrenceSuggestion.recurrenceId;
		row.suggestedRecurrenceOccurrenceOn = recurrenceSuggestion.occurrenceOn;
		suggestedOccurrences.push({
			recurrenceId: recurrenceSuggestion.recurrenceId,
			occurrenceOn: recurrenceSuggestion.occurrenceOn,
		});
	}

	return { rowValues, suggestionCount, suggestedRuleMatchCounts };
}

function invoiceDuplicateScope(invoiceId: number | null | undefined) {
	return invoiceId ? -invoiceId : null;
}
