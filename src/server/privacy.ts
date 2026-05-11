import { and, eq } from "drizzle-orm";

import { sanitizeSensitive } from "~/lib/sensitive-data";
import { db } from "~/server/db";
import {
	importBatches,
	importTemplates,
	recurrences,
	transactions,
} from "~/server/db/schema";

export type SanitizeReport = {
	transactions: SanitizeEntityReport;
	recurrences: SanitizeEntityReport;
	importBatches: SanitizeEntityReport;
	importTemplates: SanitizeEntityReport;
};

export type SanitizeEntityReport = {
	scanned: number;
	updated: number;
	fieldsUpdated: number;
};

const empty = (): SanitizeEntityReport => ({
	scanned: 0,
	updated: 0,
	fieldsUpdated: 0,
});

// Re-aplica as regras de mascaramento em texto livre já persistido. É
// idempotente: rodar duas vezes seguidas não muda nada na segunda execução.
// Restrito ao usuário informado para evitar varredura cruzada acidental.
export async function sanitizeUserHistory(
	userId: string,
): Promise<SanitizeReport> {
	const report: SanitizeReport = {
		transactions: empty(),
		recurrences: empty(),
		importBatches: empty(),
		importTemplates: empty(),
	};

	await db.transaction(async (tx) => {
		const txRows = await tx
			.select({
				id: transactions.id,
				originalDescription: transactions.originalDescription,
				description: transactions.description,
				notes: transactions.notes,
			})
			.from(transactions)
			.where(eq(transactions.userId, userId));
		report.transactions.scanned = txRows.length;
		for (const row of txRows) {
			const next = {
				originalDescription: maskNullable(row.originalDescription),
				description: sanitizeSensitive(row.description).value,
				notes: maskNullable(row.notes),
			};
			const changes = diffFields(row, next);
			if (changes.length === 0) continue;
			report.transactions.updated += 1;
			report.transactions.fieldsUpdated += changes.length;
			await tx
				.update(transactions)
				.set(next)
				.where(
					and(eq(transactions.id, row.id), eq(transactions.userId, userId)),
				);
		}

		const recurrenceRows = await tx
			.select({
				id: recurrences.id,
				description: recurrences.description,
			})
			.from(recurrences)
			.where(eq(recurrences.userId, userId));
		report.recurrences.scanned = recurrenceRows.length;
		for (const row of recurrenceRows) {
			const next = { description: maskNullable(row.description) };
			const changes = diffFields(row, next);
			if (changes.length === 0) continue;
			report.recurrences.updated += 1;
			report.recurrences.fieldsUpdated += changes.length;
			await tx
				.update(recurrences)
				.set(next)
				.where(and(eq(recurrences.id, row.id), eq(recurrences.userId, userId)));
		}

		const batchRows = await tx
			.select({
				id: importBatches.id,
				originalFileName: importBatches.originalFileName,
				sourceLabel: importBatches.sourceLabel,
			})
			.from(importBatches)
			.where(eq(importBatches.userId, userId));
		report.importBatches.scanned = batchRows.length;
		for (const row of batchRows) {
			const masked = sanitizeSensitive(row.originalFileName).value.slice(
				0,
				255,
			);
			const next = {
				originalFileName: masked,
				sourceLabel: maskNullable(row.sourceLabel),
			};
			const changes = diffFields(row, next);
			if (changes.length === 0) continue;
			report.importBatches.updated += 1;
			report.importBatches.fieldsUpdated += changes.length;
			await tx
				.update(importBatches)
				.set(next)
				.where(
					and(eq(importBatches.id, row.id), eq(importBatches.userId, userId)),
				);
		}

		const templateRows = await tx
			.select({
				id: importTemplates.id,
				sourceLabel: importTemplates.sourceLabel,
			})
			.from(importTemplates)
			.where(eq(importTemplates.userId, userId));
		report.importTemplates.scanned = templateRows.length;
		for (const row of templateRows) {
			const next = { sourceLabel: maskNullable(row.sourceLabel) };
			const changes = diffFields(row, next);
			if (changes.length === 0) continue;
			report.importTemplates.updated += 1;
			report.importTemplates.fieldsUpdated += changes.length;
			await tx
				.update(importTemplates)
				.set(next)
				.where(
					and(
						eq(importTemplates.id, row.id),
						eq(importTemplates.userId, userId),
					),
				);
		}
	});

	return report;
}

function maskNullable(value: string | null) {
	if (value === null) return null;
	return sanitizeSensitive(value).value;
}

function diffFields<T extends Record<string, unknown>>(
	previous: T,
	next: Partial<T>,
) {
	const changed: string[] = [];
	for (const key of Object.keys(next)) {
		if (!(key in previous)) continue;
		if (
			(previous as Record<string, unknown>)[key] !==
			(next as Record<string, unknown>)[key]
		) {
			changed.push(key);
		}
	}
	return changed;
}
