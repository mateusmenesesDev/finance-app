import "server-only";

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
	buildMonthWindow,
	categoryAnomalies,
	previousMonthPeriod,
	savingOpportunities,
	smallRecurringDescriptions,
	topCategoryGrowers,
} from "~/lib/analysis";
import {
	type AssistantTransaction,
	buildHistoryFromTransactions,
	heuristicAssistant,
	type Suggestion,
} from "~/lib/assistant";
import { getMonthPeriod } from "~/lib/finance-rules";
import { subscriptionReviewSuggestions } from "~/lib/recurrences";
import { db } from "~/server/db";
import {
	assistantSuggestions,
	categories,
	categoryGroups,
	financialAccounts,
	importCategoryRules,
	recurrences,
	transactions,
} from "~/server/db/schema";

export async function regenerateAssistantSuggestionsForUser(userId: string) {
	const period = getMonthPeriod();
	const trendWindow = buildMonthWindow(period, 6);
	const [
		allTransactions,
		allCategories,
		allGroups,
		rules,
		allRecurrences,
		confirmedOccurrences,
	] = await Promise.all([
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, userId))
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(asc(categories.kind), asc(categories.name)),
		db
			.select()
			.from(categoryGroups)
			.where(eq(categoryGroups.userId, userId))
			.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
		db
			.select()
			.from(importCategoryRules)
			.where(
				and(
					eq(importCategoryRules.userId, userId),
					eq(importCategoryRules.isArchived, false),
				),
			),
		db.select().from(recurrences).where(eq(recurrences.userId, userId)),
		db
			.select({
				recurrenceId: transactions.recurrenceId,
				occurrenceOn: transactions.recurrenceOccurrenceOn,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					isNotNull(transactions.recurrenceId),
					isNotNull(transactions.recurrenceOccurrenceOn),
				),
			),
	]);

	const txInputs: AssistantTransaction[] = allTransactions.map((tx) => ({
		id: tx.id,
		accountId: tx.accountId,
		categoryId: tx.categoryId,
		movementType: tx.movementType,
		status: tx.status,
		isArchived: tx.isArchived,
		amountCents: tx.amountCents,
		occurredOn: tx.occurredOn,
		description: tx.description,
		originalDescription: tx.originalDescription,
	}));
	const categoryInputs = allCategories.map((c) => ({
		id: c.id,
		groupId: c.groupId,
		name: c.name,
		kind: c.kind as "income" | "expense",
	}));
	const ruleInputs = rules.map((rule) => ({
		id: rule.id,
		categoryId: rule.categoryId,
		accountId: rule.accountId,
		movementType: rule.movementType,
		normalizedDescription: rule.normalizedDescription,
		textMatchMode: rule.textMatchMode,
		amountCents: rule.amountCents,
		amountToleranceCents: rule.amountToleranceCents,
		priority: rule.priority,
		createdAt: rule.createdAt,
	}));

	const history = buildHistoryFromTransactions(txInputs);

	const anomalies = categoryAnomalies(
		allTransactions,
		allCategories,
		allGroups,
		period,
		6,
	);

	const growers = topCategoryGrowers(
		allTransactions,
		allCategories,
		allGroups,
		period,
		{ limit: 5 },
	);
	const smallRecurring = smallRecurringDescriptions(
		allTransactions,
		trendWindow,
	).slice(0, 5);
	const subscriptionsReview = subscriptionReviewSuggestions(
		allRecurrences,
		confirmedOccurrences.filter(
			(o): o is { recurrenceId: number; occurrenceOn: string } =>
				o.recurrenceId !== null && o.occurrenceOn !== null,
		),
		period.end,
		{ topN: 5 },
	);
	const recurrenceNames = new Map(allRecurrences.map((r) => [r.id, r.name]));
	const opportunities = savingOpportunities({
		subscriptionsToReview: subscriptionsReview.map((s) => ({
			...s,
			name: recurrenceNames.get(s.recurrenceId),
		})),
		growers,
		smallRecurring,
	}).slice(0, 8);

	const generated = heuristicAssistant.generateSuggestions({
		period,
		transactions: txInputs,
		categories: categoryInputs,
		rules: ruleInputs,
		history,
		anomalies,
		opportunities,
	});

	await persistGeneratedSuggestions(userId, generated);
	return generated.length;
}

async function persistGeneratedSuggestions(
	userId: string,
	generated: Suggestion[],
) {
	const existing = await db
		.select({
			id: assistantSuggestions.id,
			fingerprint: assistantSuggestions.fingerprint,
			kind: assistantSuggestions.kind,
		})
		.from(assistantSuggestions)
		.where(
			and(
				eq(assistantSuggestions.userId, userId),
				eq(assistantSuggestions.status, "pending"),
			),
		);
	const existingByFingerprint = new Map(
		existing.map((row) => [`${row.kind}:${row.fingerprint}`, row.id]),
	);
	const generatedFingerprints = new Set(
		generated.map((s) => `${s.kind}:${s.fingerprint}`),
	);

	await db.transaction(async (tx) => {
		for (const suggestion of generated) {
			const key = `${suggestion.kind}:${suggestion.fingerprint}`;
			const existingId = existingByFingerprint.get(key);
			if (existingId) {
				await tx
					.update(assistantSuggestions)
					.set({
						payload: suggestion.payload,
						reason: suggestion.reason,
					})
					.where(
						and(
							eq(assistantSuggestions.id, existingId),
							eq(assistantSuggestions.userId, userId),
						),
					);
			} else {
				await tx.insert(assistantSuggestions).values({
					userId,
					kind: suggestion.kind,
					fingerprint: suggestion.fingerprint,
					payload: suggestion.payload,
					reason: suggestion.reason,
					status: "pending",
				});
			}
		}

		const stale = existing
			.filter(
				(row) => !generatedFingerprints.has(`${row.kind}:${row.fingerprint}`),
			)
			.map((row) => row.id);
		if (stale.length > 0) {
			await tx
				.update(assistantSuggestions)
				.set({ status: "superseded", decidedAt: new Date() })
				.where(
					and(
						eq(assistantSuggestions.userId, userId),
						inArray(assistantSuggestions.id, stale),
					),
				);
		}
	});
}

export type StoredSuggestion = {
	id: number;
	kind: Suggestion["kind"];
	fingerprint: string;
	payload: unknown;
	reason: string;
	status: "pending" | "accepted" | "rejected" | "superseded";
	decidedAt: Date | null;
	createdAt: Date;
};

export async function applyAcceptedSuggestion(
	userId: string,
	suggestionId: number,
): Promise<{ applied: boolean; message: string }> {
	const suggestion = await db.query.assistantSuggestions.findFirst({
		where: and(
			eq(assistantSuggestions.id, suggestionId),
			eq(assistantSuggestions.userId, userId),
			eq(assistantSuggestions.status, "pending"),
		),
	});
	if (!suggestion) throw new Error("Sugestão não encontrada");

	switch (suggestion.kind) {
		case "category_for_transaction": {
			const payload = suggestion.payload as {
				transactionId: number;
				categoryId: number;
				ruleId: number | null;
			};
			const updated = await db
				.update(transactions)
				.set({ categoryId: payload.categoryId, categoryRuleId: payload.ruleId })
				.where(
					and(
						eq(transactions.id, payload.transactionId),
						eq(transactions.userId, userId),
					),
				)
				.returning({ id: transactions.id });
			if (updated.length === 0) {
				return { applied: false, message: "Transação não encontrada." };
			}
			return { applied: true, message: "Categoria aplicada à transação." };
		}
		case "category_rule": {
			const payload = suggestion.payload as {
				normalizedDescription: string;
				movementType: "income" | "expense";
				categoryId: number;
			};
			const existing = await db
				.select({ id: importCategoryRules.id })
				.from(importCategoryRules)
				.where(
					and(
						eq(importCategoryRules.userId, userId),
						eq(importCategoryRules.movementType, payload.movementType),
						eq(importCategoryRules.categoryId, payload.categoryId),
						eq(
							importCategoryRules.normalizedDescription,
							payload.normalizedDescription,
						),
						eq(importCategoryRules.isArchived, false),
					),
				)
				.limit(1);
			if (existing.length === 0) {
				await db.insert(importCategoryRules).values({
					userId,
					categoryId: payload.categoryId,
					accountId: null,
					movementType: payload.movementType,
					normalizedDescription: payload.normalizedDescription,
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
					priority: 0,
				});
			}
			return { applied: true, message: "Regra de categorização criada." };
		}
		case "anomaly":
		case "savings_opportunity":
			return { applied: true, message: "Sugestão registrada." };
		default:
			return { applied: false, message: "Tipo desconhecido." };
	}
}

export async function listAssistantSummariesData(userId: string) {
	const period = getMonthPeriod();
	const previous = previousMonthPeriod(period);
	const [
		allAccounts,
		allTransactions,
		allCategories,
		allGroups,
		allRecurrences,
	] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId))
			.orderBy(asc(financialAccounts.name)),
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, userId))
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(asc(categories.kind), asc(categories.name)),
		db.select().from(categoryGroups).where(eq(categoryGroups.userId, userId)),
		db.select().from(recurrences).where(eq(recurrences.userId, userId)),
	]);
	return {
		period,
		previous,
		allAccounts,
		allTransactions,
		allCategories,
		allGroups,
		allRecurrences,
	};
}
