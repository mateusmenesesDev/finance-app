"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
	applyAcceptedSuggestion,
	regenerateAssistantSuggestionsForUser,
} from "~/server/assistant";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { assistantSuggestions } from "~/server/db/schema";
import { invalidateAfterAssistantMutation } from "~/server/invalidate";

async function requireUserId() {
	const session = await getSession();
	if (!session?.user.id) throw new Error("Sessão expirada");
	return session.user.id;
}

function intField(formData: FormData, name: string) {
	const raw = formData.get(name);
	if (typeof raw !== "string" || !raw.trim()) {
		throw new Error(`Campo obrigatório: ${name}`);
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) throw new Error(`Número inválido: ${name}`);
	return parsed;
}

export async function regenerateAssistantSuggestions() {
	const userId = await requireUserId();
	await regenerateAssistantSuggestionsForUser(userId);
	revalidatePath("/assistente");
	invalidateAfterAssistantMutation(userId);
}

export async function acceptAssistantSuggestion(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await applyAcceptedSuggestion(userId, id);
	await db
		.update(assistantSuggestions)
		.set({ status: "accepted", decidedAt: new Date() })
		.where(
			and(
				eq(assistantSuggestions.id, id),
				eq(assistantSuggestions.userId, userId),
				eq(assistantSuggestions.status, "pending"),
			),
		);
	revalidatePath("/assistente");
	invalidateAfterAssistantMutation(userId);
	revalidatePath("/transactions");
	revalidatePath("/import");
}

export async function rejectAssistantSuggestion(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db
		.update(assistantSuggestions)
		.set({ status: "rejected", decidedAt: new Date() })
		.where(
			and(
				eq(assistantSuggestions.id, id),
				eq(assistantSuggestions.userId, userId),
				eq(assistantSuggestions.status, "pending"),
			),
		);
	revalidatePath("/assistente");
	invalidateAfterAssistantMutation(userId);
}
