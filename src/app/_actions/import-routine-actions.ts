"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
	accountImportRoutineEligibility,
	cardImportRoutineEligibility,
} from "~/lib/import-routine";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	creditCards,
	financialAccounts,
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

	await db.insert(importRoutineItems).values({
		userId,
		kind: "account_statement",
		accountId,
		cardId: null,
	});
	revalidateImportRoutineSurfaces();
}

export async function removeAccountFromImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const accountId = intField(formData, "accountId");
	await db
		.delete(importRoutineItems)
		.where(
			and(
				eq(importRoutineItems.userId, userId),
				eq(importRoutineItems.accountId, accountId),
			),
		);
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

	await db.insert(importRoutineItems).values({
		userId,
		kind: "card_invoice",
		accountId: null,
		cardId,
	});
	revalidateImportRoutineSurfaces();
}

export async function removeCardFromImportRoutine(formData: FormData) {
	const userId = await requireUserId();
	const cardId = intField(formData, "cardId");
	await db
		.delete(importRoutineItems)
		.where(
			and(
				eq(importRoutineItems.userId, userId),
				eq(importRoutineItems.cardId, cardId),
			),
		);
	revalidateImportRoutineSurfaces();
}
