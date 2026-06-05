"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
	accountImportRoutineEligibility,
	cardImportRoutineEligibility,
} from "~/lib/import-routine";
import { parseMonthKey } from "~/lib/month-key";
import { recordAudit } from "~/server/audit";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	creditCards,
	financialAccounts,
	importRoutineCompletions,
	importRoutineItems,
} from "~/server/db/schema";

async function requireUserId() {
	const session = await getSession();
	if (!session?.user.id) throw new Error("Sessão expirada");
	return session.user.id;
}

function intField(formData: FormData, name: string) {
	const raw = formData.get(name);
	const value = Number.parseInt(raw?.toString() ?? "", 10);
	if (!Number.isFinite(value)) throw new Error("Identificador inválido");
	return value;
}

function revalidateImportRoutineSurfaces() {
	revalidatePath("/accounts");
	revalidatePath("/cards");
	revalidatePath("/");
}

async function auditRoutineItem(
	userId: string,
	itemId: number,
	action: "created" | "deleted" | "updated",
	summary: string,
) {
	await recordAudit(db, {
		userId,
		entityType: "import_routine_item",
		entityId: itemId,
		action,
		summary,
	});
}

export async function addAccountToImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const accountId = intField(formData, "accountId");
	const account = await db.query.financialAccounts.findFirst({
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});
	if (!account) throw new Error("Conta inválida");

	const eligibility = accountImportRoutineEligibility(account);
	if (!eligibility.ok) throw new Error(eligibility.message);

	const existing = await db.query.importRoutineItems.findFirst({
		where: and(
			eq(importRoutineItems.userId, userId),
			eq(importRoutineItems.accountId, accountId),
		),
	});
	if (existing) return;

	const [item] = await db
		.insert(importRoutineItems)
		.values({
			userId,
			kind: "account_statement",
			accountId,
			cardId: null,
		})
		.returning({ id: importRoutineItems.id });
	if (item) {
		await auditRoutineItem(
			userId,
			item.id,
			"created",
			`Conta "${account.name}" adicionada à rotina de importação`,
		);
	}
	revalidateImportRoutineSurfaces();
}

export async function removeAccountFromImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const accountId = intField(formData, "accountId");
	const existing = await db.query.importRoutineItems.findFirst({
		where: and(
			eq(importRoutineItems.userId, userId),
			eq(importRoutineItems.accountId, accountId),
		),
	});
	await db
		.delete(importRoutineItems)
		.where(
			and(
				eq(importRoutineItems.userId, userId),
				eq(importRoutineItems.accountId, accountId),
			),
		);
	if (existing) {
		await auditRoutineItem(
			userId,
			existing.id,
			"deleted",
			"Item de rotina de extrato removido",
		);
	}
	revalidateImportRoutineSurfaces();
}

export async function addCardToImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const cardId = intField(formData, "cardId");
	const card = await db.query.creditCards.findFirst({
		where: and(eq(creditCards.id, cardId), eq(creditCards.userId, userId)),
	});
	if (!card) throw new Error("Cartão inválido");

	const eligibility = cardImportRoutineEligibility(card);
	if (!eligibility.ok) throw new Error(eligibility.message);

	const existing = await db.query.importRoutineItems.findFirst({
		where: and(
			eq(importRoutineItems.userId, userId),
			eq(importRoutineItems.cardId, cardId),
		),
	});
	if (existing) return;

	const [item] = await db
		.insert(importRoutineItems)
		.values({
			userId,
			kind: "card_invoice",
			accountId: null,
			cardId,
		})
		.returning({ id: importRoutineItems.id });
	if (item) {
		await auditRoutineItem(
			userId,
			item.id,
			"created",
			`Cartão "${card.name}" adicionado à rotina de importação`,
		);
	}
	revalidateImportRoutineSurfaces();
}

export async function removeCardFromImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const cardId = intField(formData, "cardId");
	const existing = await db.query.importRoutineItems.findFirst({
		where: and(
			eq(importRoutineItems.userId, userId),
			eq(importRoutineItems.cardId, cardId),
		),
	});
	await db
		.delete(importRoutineItems)
		.where(
			and(
				eq(importRoutineItems.userId, userId),
				eq(importRoutineItems.cardId, cardId),
			),
		);
	if (existing) {
		await auditRoutineItem(
			userId,
			existing.id,
			"deleted",
			"Item de rotina de fatura removido",
		);
	}
	revalidateImportRoutineSurfaces();
}

function parseCycleMonthKey(value: string) {
	const monthKey = parseMonthKey(value);
	if (!monthKey) throw new Error("Mês do ciclo inválido");
	return monthKey;
}

async function assertRoutineItemOwnership(userId: string, routineItemId: number) {
	const item = await db.query.importRoutineItems.findFirst({
		where: and(
			eq(importRoutineItems.id, routineItemId),
			eq(importRoutineItems.userId, userId),
		),
	});
	if (!item) throw new Error("Item da rotina inválido");
	return item;
}

export async function setImportRoutineItemCompleted(
	routineItemId: number,
	cycleMonthKey: string,
) {
	const userId = await requireUserId();
	await assertRoutineItemOwnership(userId, routineItemId);
	const cycleKey = parseCycleMonthKey(cycleMonthKey);

	const existing = await db.query.importRoutineCompletions.findFirst({
		where: and(
			eq(importRoutineCompletions.userId, userId),
			eq(importRoutineCompletions.routineItemId, routineItemId),
			eq(importRoutineCompletions.cycleMonthKey, cycleKey),
		),
	});
	if (existing) return;

	await db.insert(importRoutineCompletions).values({
		userId,
		routineItemId,
		cycleMonthKey: cycleKey,
	});
	await auditRoutineItem(
		userId,
		routineItemId,
		"updated",
		`Rotina ${cycleKey} marcada como concluída`,
	);
	revalidateImportRoutineSurfaces();
}

export async function clearImportRoutineItemCompleted(
	routineItemId: number,
	cycleMonthKey: string,
) {
	const userId = await requireUserId();
	await assertRoutineItemOwnership(userId, routineItemId);
	const cycleKey = parseCycleMonthKey(cycleMonthKey);

	const deleted = await db
		.delete(importRoutineCompletions)
		.where(
			and(
				eq(importRoutineCompletions.userId, userId),
				eq(importRoutineCompletions.routineItemId, routineItemId),
				eq(importRoutineCompletions.cycleMonthKey, cycleKey),
			),
		)
		.returning({ id: importRoutineCompletions.id });
	if (deleted.length > 0) {
		await auditRoutineItem(
			userId,
			routineItemId,
			"updated",
			`Rotina ${cycleKey} desmarcada`,
		);
	}
	revalidateImportRoutineSurfaces();
}

export async function toggleImportRoutineItemCompleted(
	routineItemId: number,
	cycleMonthKey: string,
	completed: boolean,
) {
	if (completed) {
		await setImportRoutineItemCompleted(routineItemId, cycleMonthKey);
		return;
	}
	await clearImportRoutineItemCompleted(routineItemId, cycleMonthKey);
}
