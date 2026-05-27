import { revalidateTag } from "next/cache";

export type CacheDomain =
	| "accounts"
	| "cards"
	| "categories"
	| "transactions"
	| "recurrences"
	| "budgets"
	| "imports"
	| "assistant"
	| "reports"
	| "privacy";

const ALL_DOMAINS: CacheDomain[] = [
	"accounts",
	"cards",
	"categories",
	"transactions",
	"recurrences",
	"budgets",
	"imports",
	"assistant",
	"reports",
	"privacy",
];

export function userTag(userId: string, domain: CacheDomain): string {
	return `user:${userId}:${domain}`;
}

function invalidate(userId: string, ...domains: CacheDomain[]): void {
	for (const domain of domains) {
		revalidateTag(userTag(userId, domain));
	}
}

export function invalidateAfterAccountMutation(userId: string): void {
	invalidate(userId, "accounts", "transactions", "reports");
}

export function invalidateAfterCardMutation(userId: string): void {
	invalidate(userId, "cards", "transactions", "accounts", "reports");
}

export function invalidateAfterCategoryMutation(userId: string): void {
	invalidate(userId, "categories", "transactions", "budgets", "reports");
}

export function invalidateAfterTransactionMutation(userId: string): void {
	invalidate(userId, "transactions", "accounts", "cards", "reports");
}

export function invalidateAfterRecurrenceMutation(userId: string): void {
	invalidate(userId, "recurrences", "transactions");
}

export function invalidateAfterBudgetMutation(userId: string): void {
	invalidate(userId, "budgets", "transactions");
}

export function invalidateAfterImportMutation(userId: string): void {
	invalidate(
		userId,
		"imports",
		"transactions",
		"accounts",
		"cards",
		"assistant",
	);
}

export function invalidateAfterAssistantMutation(userId: string): void {
	invalidate(userId, "assistant", "transactions");
}

export function invalidateAfterSanitizeMutation(userId: string): void {
	invalidate(userId, "privacy", "imports", "transactions", "recurrences");
}

export function invalidateAllUserData(userId: string): void {
	invalidate(userId, ...ALL_DOMAINS);
}
