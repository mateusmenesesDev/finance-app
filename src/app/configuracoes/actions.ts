"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "~/server/audit";
import { auth } from "~/server/better-auth";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { sanitizeUserHistory } from "~/server/privacy";
import {
	deleteFinancialAccount,
	purgeUserFinancialData,
} from "~/server/user-data";
import { invalidateAllUserData } from "~/server/invalidate";

async function requireSession() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	return session;
}

async function requireUserId() {
	return (await requireSession()).user.id;
}

function stringField(formData: FormData, name: string) {
	return formData.get(name)?.toString().trim() ?? "";
}

function intField(formData: FormData, name: string) {
	const value = stringField(formData, name);
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed))
		throw new Error(`Campo numérico inválido: ${name}`);
	return parsed;
}

function assertEmailMatches(formData: FormData, expected: string) {
	const typed = stringField(formData, "confirmEmail");
	if (typed.toLowerCase() !== expected.toLowerCase()) {
		throw new Error("O e-mail digitado não confere com o usuário atual");
	}
}

function assertConfirmChecked(formData: FormData) {
	if (formData.get("confirm") !== "on") {
		throw new Error("Confirme a ação destrutiva marcando a caixa");
	}
}

export async function runSanitizeHistory() {
	const userId = await requireUserId();
	const report = await sanitizeUserHistory(userId);
	const totalChanged =
		report.transactions.fieldsUpdated +
		report.recurrences.fieldsUpdated +
		report.importBatches.fieldsUpdated +
		report.importTemplates.fieldsUpdated;
	await recordAudit(db, {
		userId,
		entityType: "user_data",
		entityId: null,
		action: "sanitized",
		summary: `Re-sanitização aplicada (${totalChanged} campo(s) alterado(s))`,
		diff: report,
	});
	revalidatePath("/configuracoes/privacidade");
	revalidatePath("/configuracoes/auditoria");
}

export async function deleteAccountForever(formData: FormData) {
	const session = await requireSession();
	const userId = session.user.id;
	assertEmailMatches(formData, session.user.email);
	assertConfirmChecked(formData);
	const accountId = intField(formData, "accountId");
	await deleteFinancialAccount(userId, accountId);
	invalidateAllUserData(userId);
	revalidatePath("/accounts");
	revalidatePath("/configuracoes/dados");
	revalidatePath("/configuracoes/auditoria");
}

export async function purgeAllFinancialData(formData: FormData) {
	const session = await requireSession();
	const userId = session.user.id;
	assertEmailMatches(formData, session.user.email);
	assertConfirmChecked(formData);
	const typed = stringField(formData, "confirmText");
	if (typed !== "APAGAR TUDO") {
		throw new Error('Digite exatamente "APAGAR TUDO" para confirmar');
	}
	await purgeUserFinancialData(userId);
	// Mantém a sessão do usuário (Better Auth) intacta; apenas os dados
	// financeiros foram apagados.
	void auth; // referencia mantida para upgrades futuros (delete user)
	invalidateAllUserData(userId);
	revalidatePath("/configuracoes/dados");
	revalidatePath("/configuracoes/privacidade");
	revalidatePath("/configuracoes/auditoria");
}
