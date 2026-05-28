"use server";

import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildImportBatchRows } from "~/features/imports/batch-domain";
import { matchImportCategoryRule } from "~/features/imports/category-rules";
import {
	formatConfirmCategoryError,
	type ImportConfirmCategory,
	resolveConfirmRowCategory,
} from "~/features/imports/confirm-domain";
import {
	defaultTemplateConfig,
	type ImportTemplateConfig,
	normalizeDescription,
	normalizeImportTemplateConfig,
	parseImportCsv,
} from "~/features/imports/csv-domain";
import { normalizeBudgetScopeSelection } from "~/lib/budget-form";
import type { BudgetTemplateLike } from "~/lib/budget-templates";
import {
	type CategoryActionState,
	categoryActionError,
	isDuplicateCategoryNameError,
} from "~/lib/category-errors";
import { MAX_AMOUNT_CENTS, moneyToCents } from "~/lib/money";
import { parseInvoiceMonthKey, parseMonthKey } from "~/lib/month-key";
import { maskSensitive } from "~/lib/sensitive-data";
import { recurrenceLinkForTransactionUpdate } from "~/lib/transaction-recurrence";
import { regenerateAssistantSuggestionsForUser } from "~/server/assistant";
import {
	diffTransaction,
	recordAudit,
	type TransactionAuditSnapshot,
} from "~/server/audit";
import { getSession } from "~/server/better-auth/server";
import { ensureBudgetTemplatesMaterialized } from "~/server/budget-templates";
import { db } from "~/server/db";
import {
	cardInstallmentGroups,
	cardInvoices,
	categories,
	categoryGroups,
	creditCards,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importRows,
	importTemplates,
	monthlyBudgets,
	monthlyBudgetTemplateSkips,
	monthlyBudgetTemplates,
	recurrences,
	transactionSavedFilters,
	transactions,
} from "~/server/db/schema";
import {
	invalidateAfterAccountMutation,
	invalidateAfterBudgetMutation,
	invalidateAfterCardMutation,
	invalidateAfterCategoryMutation,
	invalidateAfterImportMutation,
	invalidateAfterRecurrenceMutation,
	invalidateAfterTransactionMutation,
} from "~/server/invalidate";

type AccountType =
	| "checking"
	| "savings"
	| "cash"
	| "credit_card"
	| "investment";
type MovementType =
	| "income"
	| "expense"
	| "transfer"
	| "credit_card_payment"
	| "balance_adjustment";
type TransactionStatus =
	| "planned"
	| "confirmed"
	| "ignored"
	| "duplicate"
	| "pending_review";
type CategoryKind = "income" | "expense";
type CashFlowRole = "operational" | "financial";
type CardEntryKind = "charge" | "credit";
type ImportRuleTextMatchMode = "contains" | "exact";
type ImportRuleAction = "categorize" | "ignore" | "transfer";
type MonthlyBudgetScope = "month" | "category_group" | "category";
type RecurrenceFrequency = "once" | "weekly" | "monthly" | "yearly";
type TransactionSavedFilterSort = "date" | "value" | "category";
const accountTypes = new Set<AccountType>([
	"checking",
	"savings",
	"cash",
	"credit_card",
	"investment",
]);
const movementTypes = new Set<MovementType>([
	"income",
	"expense",
	"transfer",
	"credit_card_payment",
	"balance_adjustment",
]);
const transactionStatuses = new Set<TransactionStatus>([
	"planned",
	"confirmed",
	"ignored",
	"duplicate",
	"pending_review",
]);
const categoryKinds = new Set<CategoryKind>(["income", "expense"]);
const cashFlowRoles = new Set<CashFlowRole>(["operational", "financial"]);
const cardEntryKinds = new Set<CardEntryKind>(["charge", "credit"]);
const importRuleTextMatchModes = new Set<ImportRuleTextMatchMode>([
	"contains",
	"exact",
]);
const importRuleActions = new Set<ImportRuleAction>([
	"categorize",
	"ignore",
	"transfer",
]);
const importMovementTypes = new Set<
	"income" | "expense" | "transfer" | "credit_card_payment"
>(["income", "expense", "transfer", "credit_card_payment"]);
const monthlyBudgetScopes = new Set<MonthlyBudgetScope>([
	"month",
	"category_group",
	"category",
]);
const recurrenceMovementTypes = new Set<"income" | "expense">([
	"income",
	"expense",
]);
const recurrenceFrequencies = new Set<RecurrenceFrequency>([
	"once",
	"weekly",
	"monthly",
	"yearly",
]);
const transactionSavedFilterSorts = new Set<TransactionSavedFilterSort>([
	"date",
	"value",
	"category",
]);
const defaultGroups = [
	{
		name: "Renda",
		kind: "income" as const,
		cashFlowRole: "operational" as const,
		categories: ["Salário", "Outras receitas"],
	},
	{
		name: "Rendimentos financeiros",
		kind: "income" as const,
		cashFlowRole: "financial" as const,
		categories: ["Rendimentos", "Juros", "Dividendos"],
	},
	{
		name: "Moradia",
		kind: "expense" as const,
		cashFlowRole: "operational" as const,
		categories: ["Aluguel", "Condomínio", "Energia"],
	},
	{
		name: "Alimentação",
		kind: "expense" as const,
		categories: ["Mercado", "Restaurantes"],
	},
	{
		name: "Transporte",
		kind: "expense" as const,
		categories: ["Combustível", "Aplicativos"],
	},
	{
		name: "Saúde",
		kind: "expense" as const,
		categories: ["Farmácia", "Consultas"],
	},
	{
		name: "Lazer",
		kind: "expense" as const,
		categories: ["Eventos", "Streaming"],
	},
	{ name: "Outros", kind: "expense" as const, categories: ["Diversos"] },
];

async function requireUserId() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	return session.user.id;
}
function requiredString(formData: FormData, name: string) {
	const value = formData.get(name)?.toString().trim();
	if (!value) throw new Error(`Campo obrigatório: ${name}`);
	return value;
}
function optionalString(formData: FormData, name: string) {
	return formData.get(name)?.toString().trim() || null;
}
function sensitiveRequired(formData: FormData, name: string) {
	return maskSensitive(requiredString(formData, name));
}
function sensitiveOptional(formData: FormData, name: string) {
	const value = optionalString(formData, name);
	return value === null ? null : maskSensitive(value);
}
function intField(formData: FormData, name: string, fallback?: number) {
	const value = formData.get(name)?.toString().trim();
	if (!value) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Campo obrigatório: ${name}`);
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) throw new Error(`Número inválido: ${name}`);
	return parsed;
}
function optionalIntField(formData: FormData, name: string) {
	const value = optionalString(formData, name);
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) throw new Error(`Número inválido: ${name}`);
	return parsed;
}
function enumField<T extends string>(
	formData: FormData,
	name: string,
	allowed: Set<T>,
) {
	const value = requiredString(formData, name);
	if (!allowed.has(value as T)) throw new Error(`Valor inválido: ${name}`);
	return value as T;
}
function cardDay(formData: FormData, name: string) {
	const day = intField(formData, name);
	if (day < 1 || day > 31) throw new Error(`${name} deve ficar entre 1 e 31`);
	return day;
}

function optionalMoneyCents(formData: FormData, name: string) {
	const value = optionalString(formData, name);
	return value ? moneyToCents(value, { allowZero: false }) : null;
}

function invoiceDatesFromMonthKey(
	monthKey: string,
	closingDay: number,
	dueDay: number,
) {
	const [year, month] = monthKey.split("-").map(Number);
	if (!year || !month || month < 1 || month > 12) {
		throw new Error("Mês da fatura inválido");
	}
	const dueDate = clampIsoDate(year, month - 1, dueDay);
	const closingMonthOffset = dueDay > closingDay ? 0 : -1;
	const closingDate = clampIsoDate(
		year,
		month - 1 + closingMonthOffset,
		closingDay,
	);
	return { closingDate, dueDate };
}

function addMonthsToMonthKey(monthKey: string, months: number) {
	const [year, month] = monthKey.split("-").map(Number);
	if (!year || !month) throw new Error("Mês inválido");
	const date = new Date(year, month - 1 + months, 1);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsIsoDate(dateIso: string, months: number) {
	const [year, month, day] = dateIso.split("-").map(Number);
	if (!year || !month || !day) throw new Error("Data inválida");
	return clampIsoDate(year, month - 1 + months, day);
}

function clampIsoDate(year: number, month: number, day: number) {
	const target = new Date(year, month, 1);
	const lastDay = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0,
	).getDate();
	return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

async function ensureCardInvoice(
	tx: typeof db,
	input: { userId: string; cardId: number; monthKey: string },
) {
	const card = await tx.query.creditCards.findFirst({
		where: and(
			eq(creditCards.id, input.cardId),
			eq(creditCards.userId, input.userId),
		),
	});
	if (!card || card.isArchived) throw new Error("Cartão inválido");
	const existing = await tx.query.cardInvoices.findFirst({
		where: and(
			eq(cardInvoices.userId, input.userId),
			eq(cardInvoices.cardId, input.cardId),
			eq(cardInvoices.monthKey, input.monthKey),
		),
	});
	if (existing) return { card, invoice: existing };

	const dates = invoiceDatesFromMonthKey(
		input.monthKey,
		card.closingDay,
		card.dueDay,
	);
	const [invoice] = await tx
		.insert(cardInvoices)
		.values({
			userId: input.userId,
			cardId: input.cardId,
			monthKey: input.monthKey,
			closingDate: dates.closingDate,
			dueDate: dates.dueDate,
		})
		.returning();
	if (!invoice) throw new Error("Não foi possível criar fatura");
	return { card, invoice };
}

async function invoiceHasConfirmedPayment(userId: string, invoiceId: number) {
	const payment = await db.query.transactions.findFirst({
		where: and(
			eq(transactions.userId, userId),
			eq(transactions.cardInvoiceId, invoiceId),
			eq(transactions.movementType, "credit_card_payment"),
			eq(transactions.status, "confirmed"),
			eq(transactions.isArchived, false),
		),
	});
	return Boolean(payment);
}

function isoDateField(formData: FormData, name: string) {
	const value = requiredString(formData, name);
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
	if (
		!year ||
		!month ||
		!day ||
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		throw new Error(`Data inválida: ${name}`);
	}
	return value;
}

function monthKeyField(formData: FormData, name: string) {
	const value = requiredString(formData, name);
	const monthKey = parseMonthKey(value);
	if (!monthKey) throw new Error(`Mês inválido: ${name}. Use AAAA-MM.`);
	return monthKey;
}

function invoiceMonthKeyField(formData: FormData, name: string) {
	const value = requiredString(formData, name);
	const monthKey = parseInvoiceMonthKey(value);
	if (!monthKey) {
		throw new Error(
			`Mês inválido: ${name}. Use AAAA-MM, número do mês ou nome do mês.`,
		);
	}
	return monthKey;
}

function optionalIsoDateField(formData: FormData, name: string) {
	if (!optionalString(formData, name)) return null;
	return isoDateField(formData, name);
}

function boolField(formData: FormData, name: string) {
	const value = formData.get(name);
	return value === "on" || value === "true" || value === "1";
}

function handleCategoryActionError(error: unknown) {
	const state = categoryActionError(error);
	if (state) return state;
	throw error;
}

function weekdayFromIso(isoDate: string) {
	return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function dayFromIso(isoDate: string) {
	return Number.parseInt(isoDate.slice(8, 10), 10);
}

function moneyOrCents(
	formData: FormData,
	moneyName: string,
	centsName: string,
) {
	const money = optionalString(formData, moneyName);
	if (money) return moneyToCents(money, { allowZero: false });
	const cents = optionalIntField(formData, centsName);
	if (cents !== null) {
		if (cents <= 0) throw new Error("Valor deve ser maior que zero");
		if (cents > MAX_AMOUNT_CENTS)
			throw new Error("Valor excede o limite suportado");
		return cents;
	}
	throw new Error("Valor inválido");
}

function revalidateRecurrenceViews(userId: string) {
	invalidateAfterRecurrenceMutation(userId);
	revalidatePath("/cash-flow");
	revalidatePath("/receitas");
	revalidatePath("/recurrences");
}

function revalidateBudgetViews(userId: string) {
	invalidateAfterBudgetMutation(userId);
	revalidatePath("/budgets");
}

async function accountHasTransactions(userId: string, accountId: number) {
	const [row] = await db
		.select({ id: transactions.id })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				or(
					eq(transactions.accountId, accountId),
					eq(transactions.destinationAccountId, accountId),
				),
			),
		)
		.limit(1);
	return !!row;
}

export async function createAccount(formData: FormData) {
	const userId = await requireUserId();
	const type = enumField(formData, "type", accountTypes);
	if (type === "credit_card")
		throw new Error("Cadastre cartões na tela Cartões");

	await db.insert(financialAccounts).values({
		userId,
		name: requiredString(formData, "name"),
		type,
		institution: optionalString(formData, "institution"),
		initialBalanceCents: moneyToCents(
			requiredString(formData, "initialBalance"),
			{
				allowZero: true,
			},
		),
		creditCardClosingDay: null,
		creditCardDueDay: null,
	});
	invalidateAfterAccountMutation(userId);
}

export async function updateAccount(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const type = enumField(formData, "type", accountTypes);
	if (type === "credit_card")
		throw new Error("Cadastre cartões na tela Cartões");
	const existing = await db.query.financialAccounts.findFirst({
		where: and(
			eq(financialAccounts.id, id),
			eq(financialAccounts.userId, userId),
		),
	});
	if (!existing) throw new Error("Conta inválida");
	if (existing.type !== type && (await accountHasTransactions(userId, id))) {
		throw new Error("Não altere o tipo de uma conta que já tem transações");
	}

	await db
		.update(financialAccounts)
		.set({
			name: requiredString(formData, "name"),
			type,
			institution: optionalString(formData, "institution"),
			initialBalanceCents: moneyToCents(
				requiredString(formData, "initialBalance"),
				{
					allowZero: true,
				},
			),
			isActive: formData.get("isActive") === "on",
			creditCardClosingDay: null,
			creditCardDueDay: null,
		})
		.where(
			and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId)),
		);
	invalidateAfterAccountMutation(userId);
}

export async function archiveAccount(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db.transaction(async (tx) => {
		const before = await tx.query.financialAccounts.findFirst({
			where: and(
				eq(financialAccounts.id, id),
				eq(financialAccounts.userId, userId),
			),
		});
		if (!before || before.isArchived) return;
		await tx
			.update(financialAccounts)
			.set({ isArchived: true, isActive: false })
			.where(
				and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId)),
			);
		await recordAudit(tx, {
			userId,
			entityType: "financial_account",
			entityId: id,
			action: "archived",
			summary: `Conta "${before.name}" arquivada`,
		});
	});
	invalidateAfterAccountMutation(userId);
}

export async function createCard(formData: FormData) {
	const userId = await requireUserId();
	await db.insert(creditCards).values({
		userId,
		name: requiredString(formData, "name"),
		institution: optionalString(formData, "institution"),
		closingDay: cardDay(formData, "closingDay"),
		dueDay: cardDay(formData, "dueDay"),
		limitCents: optionalMoneyCents(formData, "limit"),
		defaultPaymentAccountId: optionalIntField(
			formData,
			"defaultPaymentAccountId",
		),
	});
	invalidateAfterCardMutation(userId);
	revalidatePath("/cards");
}

export async function updateCard(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const before = await db.query.creditCards.findFirst({
		where: and(eq(creditCards.id, id), eq(creditCards.userId, userId)),
	});
	if (!before || before.isArchived) throw new Error("Cartão inválido");
	await db
		.update(creditCards)
		.set({
			name: requiredString(formData, "name"),
			institution: optionalString(formData, "institution"),
			closingDay: cardDay(formData, "closingDay"),
			dueDay: cardDay(formData, "dueDay"),
			limitCents: optionalMoneyCents(formData, "limit"),
			defaultPaymentAccountId: optionalIntField(
				formData,
				"defaultPaymentAccountId",
			),
			isActive: formData.get("isActive") === "on",
		})
		.where(and(eq(creditCards.id, id), eq(creditCards.userId, userId)));
	invalidateAfterCardMutation(userId);
	revalidatePath("/cards");
}

export async function archiveCard(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const openRows = await db
		.select({
			amountCents: transactions.amountCents,
			kind: transactions.cardEntryKind,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.cardId, id),
				eq(transactions.status, "confirmed"),
				eq(transactions.isArchived, false),
			),
		);
	const openCents = openRows.reduce((total, row) => {
		if (row.kind === "credit") return total - row.amountCents;
		if (row.kind === null) return total - row.amountCents;
		return total + row.amountCents;
	}, 0);
	if (openCents > 0) throw new Error("Quite as faturas antes de arquivar");
	await db
		.update(creditCards)
		.set({ isArchived: true, isActive: false })
		.where(and(eq(creditCards.id, id), eq(creditCards.userId, userId)));
	invalidateAfterCardMutation(userId);
	revalidatePath("/cards");
}

async function ensureDefaultCategoryGroup(
	userId: string,
	group: (typeof defaultGroups)[number],
) {
	const [inserted] = await db
		.insert(categoryGroups)
		.values({
			userId,
			name: group.name,
			kind: group.kind,
			cashFlowRole:
				"cashFlowRole" in group ? group.cashFlowRole : "operational",
		})
		.onConflictDoNothing({
			target: [categoryGroups.userId, categoryGroups.kind, categoryGroups.name],
		})
		.returning();
	if (inserted) return inserted;

	const [existing] = await db
		.select()
		.from(categoryGroups)
		.where(
			and(
				eq(categoryGroups.userId, userId),
				eq(categoryGroups.kind, group.kind),
				eq(categoryGroups.name, group.name),
			),
		);
	if (!existing) throw new Error("Não foi possível criar grupo padrão");
	return existing;
}

async function ensureDefaultCategory(
	userId: string,
	groupId: number,
	kind: CategoryKind,
	name: string,
) {
	await db
		.insert(categories)
		.values({ userId, groupId, kind, name })
		.onConflictDoNothing({
			target: [categories.userId, categories.groupId, categories.name],
		});
}

export async function createDefaultCategories(
	_state: CategoryActionState,
	_formData: FormData,
): Promise<CategoryActionState> {
	try {
		const userId = await requireUserId();
		for (const group of defaultGroups) {
			const savedGroup = await ensureDefaultCategoryGroup(userId, group);
			for (const categoryName of group.categories) {
				await ensureDefaultCategory(
					userId,
					savedGroup.id,
					group.kind,
					categoryName,
				);
			}
		}
		invalidateAfterCategoryMutation(userId);
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function createCategoryGroup(
	_state: CategoryActionState,
	formData: FormData,
): Promise<CategoryActionState> {
	try {
		const userId = await requireUserId();
		await db.insert(categoryGroups).values({
			userId,
			name: requiredString(formData, "name"),
			kind: enumField(formData, "kind", categoryKinds),
			cashFlowRole: enumField(formData, "cashFlowRole", cashFlowRoles),
		});
		invalidateAfterCategoryMutation(userId);
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function updateCategoryGroup(
	_state: CategoryActionState,
	formData: FormData,
): Promise<CategoryActionState> {
	try {
		const userId = await requireUserId();
		await db
			.update(categoryGroups)
			.set({
				name: requiredString(formData, "name"),
				cashFlowRole: enumField(formData, "cashFlowRole", cashFlowRoles),
			})
			.where(
				and(
					eq(categoryGroups.id, intField(formData, "id")),
					eq(categoryGroups.userId, userId),
				),
			);
		invalidateAfterCategoryMutation(userId);
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function archiveCategoryGroup(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db
		.update(categoryGroups)
		.set({ isArchived: true })
		.where(and(eq(categoryGroups.id, id), eq(categoryGroups.userId, userId)));
	await db
		.update(categories)
		.set({ isArchived: true })
		.where(and(eq(categories.groupId, id), eq(categories.userId, userId)));
	invalidateAfterCategoryMutation(userId);
}

export async function createCategory(
	_state: CategoryActionState,
	formData: FormData,
): Promise<CategoryActionState> {
	try {
		const userId = await requireUserId();
		const groupId = intField(formData, "groupId");
		const name = requiredString(formData, "name");
		const group = await db.query.categoryGroups.findFirst({
			where: and(
				eq(categoryGroups.id, groupId),
				eq(categoryGroups.userId, userId),
			),
		});
		if (!group || group.isArchived) throw new Error("Grupo inválido");
		try {
			await db.insert(categories).values({
				userId,
				groupId,
				kind: group.kind,
				name,
			});
		} catch (error) {
			if (!isDuplicateCategoryNameError(error)) throw error;

			const existing = await db.query.categories.findFirst({
				where: and(
					eq(categories.userId, userId),
					eq(categories.groupId, groupId),
					eq(categories.name, name),
				),
			});
			if (!existing?.isArchived) throw error;

			await db
				.update(categories)
				.set({ isArchived: false, kind: group.kind })
				.where(
					and(eq(categories.id, existing.id), eq(categories.userId, userId)),
				);
		}
		invalidateAfterCategoryMutation(userId);
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function updateCategory(
	_state: CategoryActionState,
	formData: FormData,
): Promise<CategoryActionState> {
	try {
		const userId = await requireUserId();
		const groupId = intField(formData, "groupId");
		const group = await db.query.categoryGroups.findFirst({
			where: and(
				eq(categoryGroups.id, groupId),
				eq(categoryGroups.userId, userId),
			),
		});
		if (!group || group.isArchived) throw new Error("Grupo inválido");
		await db
			.update(categories)
			.set({
				name: requiredString(formData, "name"),
				groupId,
				kind: group.kind,
			})
			.where(
				and(
					eq(categories.id, intField(formData, "id")),
					eq(categories.userId, userId),
				),
			);
		invalidateAfterCategoryMutation(userId);
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function archiveCategory(formData: FormData) {
	const userId = await requireUserId();
	const isArchived = formData.has("isArchived")
		? boolField(formData, "isArchived")
		: true;
	await db
		.update(categories)
		.set({ isArchived })
		.where(
			and(
				eq(categories.id, intField(formData, "id")),
				eq(categories.userId, userId),
			),
		);
	invalidateAfterCategoryMutation(userId);
}

async function transactionValues(userId: string, formData: FormData) {
	const movementType = enumField(formData, "movementType", movementTypes);
	const cardId = optionalIntField(formData, "cardId");
	const cardInvoiceId = optionalIntField(formData, "cardInvoiceId");
	const invoiceMonthKey = optionalString(formData, "invoiceMonthKey");
	const accountId = optionalIntField(formData, "accountId");
	const categoryId = optionalIntField(formData, "categoryId");
	const destinationAccountId = optionalIntField(
		formData,
		"destinationAccountId",
	);
	const recurrenceId = optionalIntField(formData, "recurrenceId");
	const recurrenceOccurrenceOn = optionalIsoDateField(
		formData,
		"recurrenceOccurrenceOn",
	);
	const [account, destinationAccount, category, recurrence] = await Promise.all(
		[
			accountId
				? db.query.financialAccounts.findFirst({
						where: and(
							eq(financialAccounts.id, accountId),
							eq(financialAccounts.userId, userId),
						),
					})
				: null,
			destinationAccountId
				? db.query.financialAccounts.findFirst({
						where: and(
							eq(financialAccounts.id, destinationAccountId),
							eq(financialAccounts.userId, userId),
						),
					})
				: null,
			categoryId
				? db.query.categories.findFirst({
						where: and(
							eq(categories.id, categoryId),
							eq(categories.userId, userId),
						),
					})
				: null,
			recurrenceId
				? db.query.recurrences.findFirst({
						where: and(
							eq(recurrences.id, recurrenceId),
							eq(recurrences.userId, userId),
						),
					})
				: null,
		],
	);

	if (category?.isArchived) {
		throw new Error("Categoria arquivada não pode receber lançamentos");
	}
	if ((recurrenceId === null) !== (recurrenceOccurrenceOn === null)) {
		throw new Error(
			"Recorrência e data da ocorrência devem ser informadas juntas",
		);
	}
	if (recurrenceId && !recurrence) throw new Error("Recorrência inválida");
	if (recurrence && recurrence.movementType !== movementType) {
		throw new Error("Tipo da transação não combina com a recorrência");
	}

	const base = {
		userId,
		recurrenceId,
		recurrenceOccurrenceOn,
		movementType,
		status: enumField(formData, "status", transactionStatuses),
		amountCents: moneyToCents(requiredString(formData, "amount"), {
			allowZero: false,
		}),
		occurredOn: requiredString(formData, "occurredOn"),
		originalDescription: sensitiveOptional(formData, "originalDescription"),
		description: sensitiveRequired(formData, "description"),
		notes: sensitiveOptional(formData, "notes"),
	};

	if (movementType === "expense" && cardId) {
		if (!category)
			throw new Error("Categoria é obrigatória para compra no cartão");
		if (category.kind !== "expense") {
			throw new Error("Compra no cartão deve usar categoria de despesa");
		}
		const cardEntryKind = enumField(formData, "cardEntryKind", cardEntryKinds);
		const invoice = cardInvoiceId
			? await db.query.cardInvoices.findFirst({
					where: and(
						eq(cardInvoices.id, cardInvoiceId),
						eq(cardInvoices.userId, userId),
						eq(cardInvoices.cardId, cardId),
					),
				})
			: invoiceMonthKey
				? (
						await ensureCardInvoice(db, {
							userId,
							cardId,
							monthKey: invoiceMonthKey,
						})
					).invoice
				: null;
		if (!invoice || invoice.isArchived) throw new Error("Fatura inválida");
		if (await invoiceHasConfirmedPayment(userId, invoice.id)) {
			throw new Error("Não adicione compra em fatura já paga");
		}
		return {
			...base,
			accountId: null,
			destinationAccountId: null,
			cardId,
			cardInvoiceId: invoice.id,
			cardEntryKind,
			categoryId,
		};
	}

	if (movementType === "credit_card_payment") {
		if (!account || account.isArchived || account.type === "credit_card") {
			throw new Error("Pagamento de fatura sai de uma conta normal");
		}
		if (categoryId !== null) {
			throw new Error("Pagamento de fatura não usa categoria");
		}
		if (!cardInvoiceId) throw new Error("Fatura é obrigatória para pagamento");
		const invoice = await db.query.cardInvoices.findFirst({
			where: and(
				eq(cardInvoices.id, cardInvoiceId),
				eq(cardInvoices.userId, userId),
			),
		});
		if (!invoice || invoice.isArchived) throw new Error("Fatura inválida");
		return {
			...base,
			accountId,
			destinationAccountId: null,
			cardId: invoice.cardId,
			cardInvoiceId: invoice.id,
			cardEntryKind: null,
			categoryId: null,
		};
	}

	if (!account || account.isArchived || account.type === "credit_card") {
		throw new Error("Conta inválida");
	}
	if (
		destinationAccountId &&
		(!destinationAccount ||
			destinationAccount.isArchived ||
			destinationAccount.type === "credit_card")
	) {
		throw new Error("Conta destino inválida");
	}
	if (destinationAccountId === accountId) {
		throw new Error("Conta origem e destino devem ser diferentes");
	}
	if ((movementType === "income" || movementType === "expense") && !category) {
		throw new Error("Categoria é obrigatória para receita e despesa");
	}
	if (movementType === "income" && category?.kind !== "income") {
		throw new Error("Receita deve usar categoria de receita");
	}
	if (movementType === "expense" && category?.kind !== "expense") {
		throw new Error("Despesa deve usar categoria de despesa");
	}
	if (
		movementType !== "income" &&
		movementType !== "expense" &&
		categoryId !== null
	) {
		throw new Error("Transferências, pagamentos e ajustes não usam categoria");
	}
	if (movementType === "transfer" && !destinationAccount) {
		throw new Error("Conta destino é obrigatória para transferência");
	}

	return {
		...base,
		accountId,
		destinationAccountId,
		cardId: null,
		cardInvoiceId: null,
		cardEntryKind: null,
		categoryId,
	};
}

export async function createCardPurchase(formData: FormData) {
	const userId = await requireUserId();
	const cardId = intField(formData, "cardId");
	const monthKey = invoiceMonthKeyField(formData, "invoiceMonthKey");
	const categoryId = intField(formData, "categoryId");
	const installmentCount = intField(formData, "installmentCount", 1);
	if (installmentCount < 1 || installmentCount > 120) {
		throw new Error("Quantidade de parcelas inválida");
	}
	const totalAmountCents = moneyToCents(requiredString(formData, "amount"), {
		allowZero: false,
	});
	const occurredOn = isoDateField(formData, "occurredOn");
	const description = sensitiveRequired(formData, "description");
	const originalDescription = sensitiveOptional(
		formData,
		"originalDescription",
	);
	const notes = sensitiveOptional(formData, "notes");
	const category = await db.query.categories.findFirst({
		where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
	});
	if (!category || category.isArchived || category.kind !== "expense") {
		throw new Error("Categoria de despesa inválida");
	}

	await db.transaction(async (tx) => {
		const { invoice } = await ensureCardInvoice(tx as unknown as typeof db, {
			userId,
			cardId,
			monthKey,
		});
		if (await invoiceHasConfirmedPayment(userId, invoice.id)) {
			throw new Error("Não adicione compra em fatura já paga");
		}
		let groupId: number | null = null;
		if (installmentCount > 1) {
			const [group] = await tx
				.insert(cardInstallmentGroups)
				.values({
					userId,
					cardId,
					description,
					totalAmountCents,
					totalInstallments: installmentCount,
				})
				.returning({ id: cardInstallmentGroups.id });
			if (!group) throw new Error("Falha ao criar parcelamento");
			groupId = group.id;
		}
		const baseInstallment = Math.floor(totalAmountCents / installmentCount);
		const remainder = totalAmountCents % installmentCount;
		for (let index = 0; index < installmentCount; index++) {
			const targetMonthKey = addMonthsToMonthKey(monthKey, index);
			const { invoice: targetInvoice } = await ensureCardInvoice(
				tx as unknown as typeof db,
				{
					userId,
					cardId,
					monthKey: targetMonthKey,
				},
			);
			if (await invoiceHasConfirmedPayment(userId, targetInvoice.id)) {
				throw new Error("Parcelamento cairia em fatura já paga");
			}
			await tx.insert(transactions).values({
				userId,
				accountId: null,
				destinationAccountId: null,
				cardId,
				cardInvoiceId: targetInvoice.id,
				cardEntryKind: "charge",
				cardInstallmentGroupId: groupId,
				installmentNumber: installmentCount > 1 ? index + 1 : null,
				installmentCount: installmentCount > 1 ? installmentCount : null,
				categoryId,
				movementType: "expense",
				status: "confirmed",
				amountCents: baseInstallment + (index < remainder ? 1 : 0),
				occurredOn: addMonthsIsoDate(occurredOn, index),
				originalDescription,
				description:
					installmentCount > 1
						? `${description} (${index + 1}/${installmentCount})`
						: description,
				notes,
			});
		}
		await recordAudit(tx, {
			userId,
			entityType: "transaction",
			entityId: groupId ?? invoice.id,
			action: "created",
			summary: `Compra no cartão criada (${installmentCount} parcela(s))`,
		});
	});
	invalidateAfterCardMutation(userId);
	revalidatePath("/cards");
	revalidatePath("/transactions");
}

export async function payCardInvoice(formData: FormData) {
	const userId = await requireUserId();
	const values = await transactionValues(userId, formData);
	if (values.movementType !== "credit_card_payment") {
		throw new Error("Ação exclusiva para pagamento de fatura");
	}
	await db.insert(transactions).values(values);
	invalidateAfterCardMutation(userId);
	revalidatePath("/cards");
	revalidatePath("/transactions");
}

export async function createTransaction(formData: FormData) {
	const userId = await requireUserId();
	const values = await transactionValues(userId, formData);
	await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(transactions)
			.values(values)
			.returning({ id: transactions.id });
		if (!inserted) throw new Error("Falha ao criar transação");
		await recordAudit(tx, {
			userId,
			entityType: "transaction",
			entityId: inserted.id,
			action: "created",
			summary: `Transação criada (${values.movementType}, ${values.amountCents} centavos)`,
		});
	});
	invalidateAfterTransactionMutation(userId);
	revalidatePath("/receitas");
	revalidatePath("/transactions");
}

export async function updateTransaction(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const values = await transactionValues(userId, formData);
	const formHasRecurrenceFields =
		formData.has("recurrenceId") || formData.has("recurrenceOccurrenceOn");
	await db.transaction(async (tx) => {
		const before = await tx.query.transactions.findFirst({
			where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
		});
		if (!before) throw new Error("Transação não encontrada");
		const recurrenceLink = recurrenceLinkForTransactionUpdate({
			formHasRecurrenceFields,
			existing: before,
			nextMovementType: values.movementType,
			parsedLink: {
				recurrenceId: values.recurrenceId,
				recurrenceOccurrenceOn: values.recurrenceOccurrenceOn,
			},
		});
		const nextValues = { ...values, ...recurrenceLink };
		await tx
			.update(transactions)
			.set(nextValues)
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
		const diff = diffTransaction(
			toTransactionSnapshot(before),
			toTransactionSnapshot({ ...before, ...nextValues }),
		);
		if (diff.length > 0) {
			await recordAudit(tx, {
				userId,
				entityType: "transaction",
				entityId: id,
				action: "updated",
				summary: `Transação ${id} atualizada (${diff.length} campo(s))`,
				diff,
			});
		}
	});
	invalidateAfterTransactionMutation(userId);
	revalidatePath("/receitas");
	revalidatePath("/transactions");
}

export async function archiveTransaction(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db.transaction(async (tx) => {
		const before = await tx.query.transactions.findFirst({
			where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
		});
		if (!before) return;
		if (before.isArchived) return;
		await tx
			.update(transactions)
			.set({ isArchived: true })
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
		await recordAudit(tx, {
			userId,
			entityType: "transaction",
			entityId: id,
			action: "archived",
			summary: `Transação ${id} arquivada`,
			diff: [{ field: "isArchived", from: false, to: true }],
		});
	});
	invalidateAfterTransactionMutation(userId);
	revalidatePath("/receitas");
	revalidatePath("/transactions");
}

export async function saveTransactionFilter(formData: FormData) {
	const userId = await requireUserId();
	const start = isoDateField(formData, "start");
	const end = isoDateField(formData, "end");
	if (end < start) throw new Error("Período inválido");
	const name = requiredString(formData, "name");
	if (name.length > 120) throw new Error("Nome deve ter até 120 caracteres");
	const accountId = optionalIntField(formData, "accountId");
	const categoryId = optionalIntField(formData, "categoryId");
	const movementType = optionalString(formData, "movementType");
	if (movementType && !movementTypes.has(movementType as MovementType)) {
		throw new Error("Tipo inválido");
	}
	const sort = optionalString(formData, "sort") ?? "date";
	if (!transactionSavedFilterSorts.has(sort as TransactionSavedFilterSort)) {
		throw new Error("Ordenação inválida");
	}
	if (accountId) {
		const account = await db.query.financialAccounts.findFirst({
			where: and(
				eq(financialAccounts.id, accountId),
				eq(financialAccounts.userId, userId),
			),
		});
		if (!account || account.isArchived) throw new Error("Conta inválida");
	}
	if (categoryId) {
		const category = await db.query.categories.findFirst({
			where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
		});
		if (!category || category.isArchived) throw new Error("Categoria inválida");
	}
	const values = {
		start,
		end,
		accountId,
		categoryId,
		movementType: movementType ? (movementType as MovementType) : null,
		query: optionalString(formData, "q"),
		sort: sort as TransactionSavedFilterSort,
	};
	const existing = await db.query.transactionSavedFilters.findFirst({
		where: and(
			eq(transactionSavedFilters.userId, userId),
			eq(transactionSavedFilters.name, name),
		),
	});
	if (existing) {
		await db
			.update(transactionSavedFilters)
			.set(values)
			.where(
				and(
					eq(transactionSavedFilters.id, existing.id),
					eq(transactionSavedFilters.userId, userId),
				),
			);
	} else {
		await db
			.insert(transactionSavedFilters)
			.values({ userId, name, ...values });
	}
	revalidatePath("/transactions");
}

export async function deleteTransactionFilter(formData: FormData) {
	const userId = await requireUserId();
	await db
		.delete(transactionSavedFilters)
		.where(
			and(
				eq(transactionSavedFilters.id, intField(formData, "id")),
				eq(transactionSavedFilters.userId, userId),
			),
		);
	revalidatePath("/transactions");
}

export async function quickCategorizeTransaction(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const categoryId = intField(formData, "categoryId");
	const [transaction, category] = await Promise.all([
		db.query.transactions.findFirst({
			where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
		}),
		db.query.categories.findFirst({
			where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
		}),
	]);
	if (!transaction) throw new Error("Transação não encontrada");
	if (!category || category.isArchived) throw new Error("Categoria inválida");
	if (
		(transaction.movementType === "income" && category.kind !== "income") ||
		(transaction.movementType === "expense" && category.kind !== "expense") ||
		(transaction.movementType !== "income" &&
			transaction.movementType !== "expense")
	) {
		throw new Error("Categoria incompatível com o tipo da transação");
	}
	await db.transaction(async (tx) => {
		await tx
			.update(transactions)
			.set({ categoryId })
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
		await recordAudit(tx, {
			userId,
			entityType: "transaction",
			entityId: id,
			action: "updated",
			summary: `Transação ${id} categorizada rapidamente`,
			diff: [
				{ field: "categoryId", from: transaction.categoryId, to: categoryId },
			],
		});
	});
	invalidateAfterTransactionMutation(userId);
	revalidatePath("/receitas");
	revalidatePath("/transactions");
}

export async function bulkUpdateTransactions(formData: FormData) {
	const userId = await requireUserId();
	const ids = formData
		.getAll("transactionId")
		.map((value) => Number.parseInt(value.toString(), 10))
		.filter((id) => Number.isFinite(id));
	const uniqueIds = [...new Set(ids)];
	if (uniqueIds.length === 0) throw new Error("Selecione transações");
	if (uniqueIds.length > 100)
		throw new Error("Edição em massa limitada a 100 transações");

	const values: Partial<typeof transactions.$inferInsert> = {};
	if (boolField(formData, "changeCategory")) {
		values.categoryId = optionalIntField(formData, "bulkCategoryId");
	}
	if (boolField(formData, "changeStatus")) {
		values.status = enumField(formData, "bulkStatus", transactionStatuses);
	}
	if (boolField(formData, "changeAccount")) {
		values.accountId = intField(formData, "bulkAccountId");
	}
	if (boolField(formData, "changeNotes")) {
		values.notes = sensitiveOptional(formData, "bulkNotes");
	}
	if (boolField(formData, "changeArchive")) {
		values.isArchived =
			enumField(formData, "bulkArchive", new Set(["true", "false"])) === "true";
	}
	if (Object.keys(values).length === 0)
		throw new Error("Nenhuma alteração escolhida");

	const selected = await db
		.select()
		.from(transactions)
		.where(
			and(eq(transactions.userId, userId), inArray(transactions.id, uniqueIds)),
		);
	if (selected.length !== uniqueIds.length) throw new Error("Seleção inválida");
	if (values.accountId) {
		const [account, userAccounts] = await Promise.all([
			db.query.financialAccounts.findFirst({
				where: and(
					eq(financialAccounts.id, values.accountId),
					eq(financialAccounts.userId, userId),
				),
			}),
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, userId)),
		]);
		if (!account || account.isArchived) throw new Error("Conta inválida");
		const accountById = new Map(
			userAccounts.map((candidate) => [candidate.id, candidate]),
		);
		for (const transaction of selected) {
			if (transaction.destinationAccountId === values.accountId) {
				throw new Error("Conta origem e destino devem ser diferentes");
			}
			if (
				transaction.movementType === "credit_card_payment" &&
				account.type === "credit_card"
			) {
				throw new Error(
					"Pagamento de fatura deve sair de conta normal, não de cartão",
				);
			}
			if (
				transaction.movementType === "credit_card_payment" &&
				transaction.destinationAccountId &&
				accountById.get(transaction.destinationAccountId)?.type !==
					"credit_card"
			) {
				throw new Error("Pagamento de fatura exige cartão como destino");
			}
		}
	}
	const bulkCategoryId = values.categoryId;
	if (bulkCategoryId !== undefined && bulkCategoryId !== null) {
		const category = await db.query.categories.findFirst({
			where: and(
				eq(categories.id, bulkCategoryId),
				eq(categories.userId, userId),
			),
		});
		if (!category || category.isArchived) throw new Error("Categoria inválida");
		for (const transaction of selected) {
			if (
				(transaction.movementType === "income" && category.kind !== "income") ||
				(transaction.movementType === "expense" &&
					category.kind !== "expense") ||
				(transaction.movementType !== "income" &&
					transaction.movementType !== "expense")
			) {
				throw new Error("Categoria incompatível com uma transação selecionada");
			}
		}
	}

	await db.transaction(async (tx) => {
		await tx
			.update(transactions)
			.set(values)
			.where(
				and(
					eq(transactions.userId, userId),
					inArray(transactions.id, uniqueIds),
				),
			);
		for (const before of selected) {
			const diff = diffTransaction(
				toTransactionSnapshot(before),
				toTransactionSnapshot({ ...before, ...values }),
			);
			if (diff.length === 0) continue;
			await recordAudit(tx, {
				userId,
				entityType: "transaction",
				entityId: before.id,
				action: "updated",
				summary: `Transação ${before.id} atualizada em massa (${diff.length} campo(s))`,
				diff,
			});
		}
	});
	invalidateAfterTransactionMutation(userId);
	revalidatePath("/receitas");
	revalidatePath("/transactions");
}

function toTransactionSnapshot(row: {
	accountId: number | null;
	destinationAccountId: number | null;
	categoryId: number | null;
	movementType: string;
	status: string;
	amountCents: number;
	occurredOn: string;
	isArchived: boolean;
}): TransactionAuditSnapshot {
	return {
		accountId: row.accountId,
		destinationAccountId: row.destinationAccountId,
		categoryId: row.categoryId,
		movementType: row.movementType,
		status: row.status,
		amountCents: row.amountCents,
		occurredOn: row.occurredOn,
		isArchived: row.isArchived,
	};
}

async function recurrenceValues(userId: string, formData: FormData) {
	const name = requiredString(formData, "name");
	if (name.length > 120) throw new Error("Nome deve ter até 120 caracteres");
	const movementType = enumField(
		formData,
		"movementType",
		recurrenceMovementTypes,
	);
	const accountId = intField(formData, "accountId");
	const isBill = boolField(formData, "isBill");
	const categoryId = isBill
		? optionalIntField(formData, "categoryId")
		: intField(formData, "categoryId");
	const frequency = enumField(formData, "frequency", recurrenceFrequencies);
	const startsOn = isoDateField(formData, "startsOn");
	let endsOn = optionalIsoDateField(formData, "endsOn");
	const intervalCount = intField(formData, "intervalCount", 1);
	if (intervalCount < 1)
		throw new Error("Intervalo deve ser maior ou igual a 1");
	if (endsOn && endsOn < startsOn)
		throw new Error("Data final deve ser maior ou igual à inicial");
	if (frequency === "once" && endsOn && endsOn !== startsOn) {
		throw new Error("Recorrência única deve terminar na data inicial");
	}
	if (frequency === "once") endsOn ??= null;

	const account = await db.query.financialAccounts.findFirst({
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});
	if (!account || account.isArchived) throw new Error("Conta inválida");

	const category = categoryId
		? await db.query.categories.findFirst({
				where: and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
				),
			})
		: null;
	if (!isBill && !category) throw new Error("Categoria é obrigatória");
	if (category?.isArchived)
		throw new Error("Categoria arquivada não pode ser usada");
	if (movementType === "income" && category && category.kind !== "income") {
		throw new Error("Receita deve usar categoria de receita");
	}
	if (movementType === "expense" && category && category.kind !== "expense") {
		throw new Error("Despesa deve usar categoria de despesa");
	}

	let anchorDay = optionalIntField(formData, "anchorDay");
	let anchorWeekday = optionalIntField(formData, "anchorWeekday");
	if (frequency === "monthly") anchorDay ??= dayFromIso(startsOn);
	if (frequency === "weekly") anchorWeekday ??= weekdayFromIso(startsOn);
	if (anchorDay !== null && (anchorDay < 1 || anchorDay > 31)) {
		throw new Error("Dia âncora deve ficar entre 1 e 31");
	}
	if (anchorWeekday !== null && (anchorWeekday < 0 || anchorWeekday > 6)) {
		throw new Error("Dia da semana deve ficar entre 0 e 6");
	}

	return {
		userId,
		name,
		description: sensitiveOptional(formData, "description"),
		movementType,
		accountId,
		categoryId,
		amountCents: moneyOrCents(formData, "amount", "amountCents"),
		currency: optionalString(formData, "currency") ?? "BRL",
		frequency,
		intervalCount,
		anchorDay,
		anchorWeekday,
		startsOn,
		endsOn,
		isSubscription: boolField(formData, "isSubscription"),
		isBill,
	};
}

export async function createRecurrence(formData: FormData) {
	const userId = await requireUserId();
	await db.insert(recurrences).values(await recurrenceValues(userId, formData));
	revalidateRecurrenceViews(userId);
}

export async function updateRecurrence(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db
		.update(recurrences)
		.set(await recurrenceValues(userId, formData))
		.where(and(eq(recurrences.id, id), eq(recurrences.userId, userId)));
	revalidateRecurrenceViews(userId);
}

export async function archiveRecurrence(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(recurrences)
		.set({ isArchived: boolField(formData, "isArchived") })
		.where(
			and(
				eq(recurrences.id, intField(formData, "id")),
				eq(recurrences.userId, userId),
			),
		);
	revalidateRecurrenceViews(userId);
}

export async function confirmRecurrenceOccurrence(formData: FormData) {
	const userId = await requireUserId();
	const recurrenceId = intField(formData, "recurrenceId");
	const occurrenceOn = isoDateField(formData, "occurrenceOn");
	const recurrence = await db.query.recurrences.findFirst({
		where: and(
			eq(recurrences.id, recurrenceId),
			eq(recurrences.userId, userId),
		),
	});
	if (!recurrence) throw new Error("Recorrência inválida");

	try {
		await db.insert(transactions).values({
			userId,
			accountId: recurrence.accountId,
			categoryId: recurrence.categoryId,
			recurrenceId,
			recurrenceOccurrenceOn: occurrenceOn,
			movementType: recurrence.movementType,
			status: "confirmed",
			amountCents: moneyOrCents(formData, "amount", "amountCents"),
			currency: recurrence.currency,
			occurredOn: optionalIsoDateField(formData, "occurredOn") ?? occurrenceOn,
			description:
				sensitiveOptional(formData, "description") ??
				maskSensitive(recurrence.name),
			notes: sensitiveOptional(formData, "notes"),
		});
	} catch (error) {
		if (
			String(error).includes(
				"finance_app_transactions_recurrence_occurrence_idx",
			)
		) {
			throw new Error("Ocorrência já confirmada para esta recorrência");
		}
		throw error;
	}
	revalidateRecurrenceViews(userId);
}

export async function linkTransactionToRecurrence(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "transactionId");
	const recurrenceId = intField(formData, "recurrenceId");
	const occurrenceOn = isoDateField(formData, "occurrenceOn");
	const [transaction, recurrence] = await Promise.all([
		db.query.transactions.findFirst({
			where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
		}),
		db.query.recurrences.findFirst({
			where: and(
				eq(recurrences.id, recurrenceId),
				eq(recurrences.userId, userId),
			),
		}),
	]);
	if (!transaction) throw new Error("Transação inválida");
	if (!recurrence) throw new Error("Recorrência inválida");
	if (transaction.movementType !== recurrence.movementType) {
		throw new Error("Tipo da transação não combina com a recorrência");
	}
	try {
		await db
			.update(transactions)
			.set({ recurrenceId, recurrenceOccurrenceOn: occurrenceOn })
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
	} catch (error) {
		if (
			String(error).includes(
				"finance_app_transactions_recurrence_occurrence_idx",
			)
		) {
			throw new Error("Ocorrência já confirmada para esta recorrência");
		}
		throw error;
	}
	revalidateRecurrenceViews(userId);
}

export async function unlinkTransactionFromRecurrence(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(transactions)
		.set({ recurrenceId: null, recurrenceOccurrenceOn: null })
		.where(
			and(
				eq(transactions.id, intField(formData, "transactionId")),
				eq(transactions.userId, userId),
			),
		);
	revalidateRecurrenceViews(userId);
}

async function budgetValues(userId: string, formData: FormData) {
	const scope = enumField(formData, "scope", monthlyBudgetScopes);
	const { categoryGroupId, categoryId } = normalizeBudgetScopeSelection(scope, {
		categoryGroupId: optionalIntField(formData, "categoryGroupId"),
		categoryId: optionalIntField(formData, "categoryId"),
	});
	if (scope === "category_group" && categoryGroupId === null) {
		throw new Error("Orçamento por grupo exige um grupo");
	}
	if (scope === "category" && categoryId === null) {
		throw new Error("Orçamento por categoria exige uma categoria");
	}

	if (categoryGroupId) {
		const [group] = await db
			.select({ id: categoryGroups.id })
			.from(categoryGroups)
			.where(
				and(
					eq(categoryGroups.id, categoryGroupId),
					eq(categoryGroups.userId, userId),
					eq(categoryGroups.kind, "expense"),
					eq(categoryGroups.isArchived, false),
				),
			)
			.limit(1);
		if (!group) throw new Error("Grupo de despesa inválido");
	}

	if (categoryId) {
		const [category] = await db
			.select({ id: categories.id })
			.from(categories)
			.where(
				and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
					eq(categories.kind, "expense"),
					eq(categories.isArchived, false),
				),
			)
			.limit(1);
		if (!category) throw new Error("Categoria de despesa inválida");
	}

	return {
		amountCents: moneyToCents(requiredString(formData, "amount"), {
			allowZero: false,
		}),
		categoryGroupId,
		categoryId,
		monthKey: monthKeyField(formData, "monthKey"),
		scope,
		userId,
	};
}

function sameBudgetTarget(
	candidate: Pick<
		BudgetTemplateLike,
		"scope" | "categoryGroupId" | "categoryId"
	>,
	target: Pick<BudgetTemplateLike, "scope" | "categoryGroupId" | "categoryId">,
) {
	return (
		candidate.scope === target.scope &&
		candidate.categoryGroupId === target.categoryGroupId &&
		candidate.categoryId === target.categoryId
	);
}

async function upsertBudgetMonth(
	values: Awaited<ReturnType<typeof budgetValues>>,
	options?: {
		templateId?: number | null;
	},
) {
	const set =
		options?.templateId !== undefined
			? {
					amountCents: values.amountCents,
					templateId: options.templateId,
					updatedAt: new Date(),
				}
			: {
					amountCents: values.amountCents,
					updatedAt: new Date(),
				};
	await db
		.insert(monthlyBudgets)
		.values({
			...values,
			templateId: options?.templateId ?? null,
		})
		.onConflictDoUpdate({
			set,
			target: [
				monthlyBudgets.userId,
				monthlyBudgets.monthKey,
				monthlyBudgets.scope,
				monthlyBudgets.categoryGroupId,
				monthlyBudgets.categoryId,
			],
		});
}

async function syncTemplateBudgetAmounts(input: {
	amountCents: number;
	fromMonthKey: string;
	previousAmountCents: number;
	templateId: number;
	userId: string;
}) {
	if (input.amountCents === input.previousAmountCents) return;
	await db
		.update(monthlyBudgets)
		.set({
			amountCents: input.amountCents,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(monthlyBudgets.userId, input.userId),
				eq(monthlyBudgets.templateId, input.templateId),
				gte(monthlyBudgets.monthKey, input.fromMonthKey),
				eq(monthlyBudgets.amountCents, input.previousAmountCents),
			),
		);
}

async function upsertRecurringBudgetTemplate(
	userId: string,
	values: Pick<
		Awaited<ReturnType<typeof budgetValues>>,
		"amountCents" | "categoryGroupId" | "categoryId" | "scope"
	> & {
		startsAtMonthKey: string;
	},
) {
	const templates = await db
		.select()
		.from(monthlyBudgetTemplates)
		.where(eq(monthlyBudgetTemplates.userId, userId));
	const existing = templates.find((template) =>
		sameBudgetTarget(template, values),
	);
	if (!existing) {
		const [created] = await db
			.insert(monthlyBudgetTemplates)
			.values({
				...values,
				userId,
			})
			.returning({ id: monthlyBudgetTemplates.id });
		if (!created)
			throw new Error("Não foi possível criar o orçamento recorrente");
		return { previousAmountCents: values.amountCents, templateId: created.id };
	}

	await db
		.update(monthlyBudgetTemplates)
		.set({
			amountCents: values.amountCents,
			isArchived: false,
			startsAtMonthKey: values.startsAtMonthKey,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(monthlyBudgetTemplates.id, existing.id),
				eq(monthlyBudgetTemplates.userId, userId),
			),
		);
	await db
		.delete(monthlyBudgetTemplateSkips)
		.where(
			and(
				eq(monthlyBudgetTemplateSkips.templateId, existing.id),
				eq(monthlyBudgetTemplateSkips.userId, userId),
				gte(monthlyBudgetTemplateSkips.monthKey, values.startsAtMonthKey),
			),
		);
	return {
		previousAmountCents: existing.amountCents,
		templateId: existing.id,
	};
}

async function archiveBudgetTemplateFromMonth(
	userId: string,
	templateId: number,
	fromMonthKey: string,
) {
	await db
		.update(monthlyBudgetTemplates)
		.set({
			isArchived: true,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(monthlyBudgetTemplates.id, templateId),
				eq(monthlyBudgetTemplates.userId, userId),
			),
		);
	await db
		.delete(monthlyBudgets)
		.where(
			and(
				eq(monthlyBudgets.userId, userId),
				eq(monthlyBudgets.templateId, templateId),
				gte(monthlyBudgets.monthKey, fromMonthKey),
			),
		);
	await db
		.delete(monthlyBudgetTemplateSkips)
		.where(
			and(
				eq(monthlyBudgetTemplateSkips.userId, userId),
				eq(monthlyBudgetTemplateSkips.templateId, templateId),
				gte(monthlyBudgetTemplateSkips.monthKey, fromMonthKey),
			),
		);
}

export async function createOrUpdateBudget(formData: FormData) {
	const userId = await requireUserId();
	const values = await budgetValues(userId, formData);
	if (boolField(formData, "repeatEveryMonth")) {
		const template = await upsertRecurringBudgetTemplate(userId, {
			amountCents: values.amountCents,
			categoryGroupId: values.categoryGroupId,
			categoryId: values.categoryId,
			scope: values.scope,
			startsAtMonthKey: values.monthKey,
		});
		await syncTemplateBudgetAmounts({
			amountCents: values.amountCents,
			fromMonthKey: values.monthKey,
			previousAmountCents: template.previousAmountCents,
			templateId: template.templateId,
			userId,
		});
		await upsertBudgetMonth(values, { templateId: template.templateId });
	} else {
		await upsertBudgetMonth(values);
	}
	revalidateBudgetViews(userId);
}

export async function deleteBudget(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const deleteMode = optionalString(formData, "deleteMode");
	const [budget] = await db
		.select({
			id: monthlyBudgets.id,
			monthKey: monthlyBudgets.monthKey,
			templateId: monthlyBudgets.templateId,
		})
		.from(monthlyBudgets)
		.where(and(eq(monthlyBudgets.id, id), eq(monthlyBudgets.userId, userId)))
		.limit(1);
	if (!budget) throw new Error("Orçamento inválido");

	if (deleteMode === "month_only") {
		if (!budget.templateId) throw new Error("Este orçamento não é recorrente");
		await db
			.insert(monthlyBudgetTemplateSkips)
			.values({
				monthKey: budget.monthKey,
				templateId: budget.templateId,
				userId,
			})
			.onConflictDoNothing({
				target: [
					monthlyBudgetTemplateSkips.templateId,
					monthlyBudgetTemplateSkips.monthKey,
				],
			});
	}

	if (deleteMode === "template") {
		if (!budget.templateId) throw new Error("Este orçamento não é recorrente");
		await archiveBudgetTemplateFromMonth(
			userId,
			budget.templateId,
			budget.monthKey,
		);
	} else {
		await db
			.delete(monthlyBudgets)
			.where(and(eq(monthlyBudgets.id, id), eq(monthlyBudgets.userId, userId)));
	}
	revalidateBudgetViews(userId);
}

export async function updateBudgetTemplate(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const amountCents = moneyToCents(requiredString(formData, "amount"), {
		allowZero: false,
	});
	const currentMonthKey = monthKeyField(formData, "currentMonthKey");
	const [template] = await db
		.select()
		.from(monthlyBudgetTemplates)
		.where(
			and(
				eq(monthlyBudgetTemplates.id, id),
				eq(monthlyBudgetTemplates.userId, userId),
			),
		)
		.limit(1);
	if (!template) throw new Error("Orçamento recorrente inválido");

	await db
		.update(monthlyBudgetTemplates)
		.set({
			amountCents,
			isArchived: false,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(monthlyBudgetTemplates.id, id),
				eq(monthlyBudgetTemplates.userId, userId),
			),
		);
	await syncTemplateBudgetAmounts({
		amountCents,
		fromMonthKey: currentMonthKey,
		previousAmountCents: template.amountCents,
		templateId: id,
		userId,
	});
	revalidateBudgetViews(userId);
}

export async function archiveBudgetTemplate(formData: FormData) {
	const userId = await requireUserId();
	const templateId = intField(formData, "templateId");
	const currentMonthKey = monthKeyField(formData, "currentMonthKey");
	await archiveBudgetTemplateFromMonth(userId, templateId, currentMonthKey);
	revalidateBudgetViews(userId);
}

export async function copyBudgetMonth(formData: FormData) {
	const userId = await requireUserId();
	const sourceMonthKey = monthKeyField(formData, "sourceMonthKey");
	const targetMonthKey = monthKeyField(formData, "targetMonthKey");
	if (sourceMonthKey === targetMonthKey) {
		throw new Error("Escolha meses diferentes para copiar orçamento");
	}
	await ensureBudgetTemplatesMaterialized(userId, [
		sourceMonthKey,
		targetMonthKey,
	]);
	const sourceBudgets = await db
		.select()
		.from(monthlyBudgets)
		.where(
			and(
				eq(monthlyBudgets.userId, userId),
				eq(monthlyBudgets.monthKey, sourceMonthKey),
			),
		);
	if (sourceBudgets.length > 0) {
		await db
			.insert(monthlyBudgets)
			.values(
				sourceBudgets.map((budget) => ({
					amountCents: budget.amountCents,
					categoryGroupId: budget.categoryGroupId,
					categoryId: budget.categoryId,
					monthKey: targetMonthKey,
					scope: budget.scope,
					userId,
				})),
			)
			.onConflictDoNothing({
				target: [
					monthlyBudgets.userId,
					monthlyBudgets.monthKey,
					monthlyBudgets.scope,
					monthlyBudgets.categoryGroupId,
					monthlyBudgets.categoryId,
				],
			});
	}
	revalidateBudgetViews(userId);
}

function csvTokens(value: string | null, fallback: string[]) {
	if (!value) return fallback;
	const tokens = value
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean);
	return tokens.length > 0 ? tokens : fallback;
}

function templateConfigFromForm(formData: FormData): ImportTemplateConfig {
	const amountMode = enumField(
		formData,
		"amountMode",
		new Set<ImportTemplateConfig["amountMode"]>(["signed", "separate"]),
	);
	return normalizeImportTemplateConfig({
		delimiter: enumField(
			formData,
			"delimiter",
			new Set<ImportTemplateConfig["delimiter"]>(["auto", ",", ";"]),
		),
		dateFormat: enumField(
			formData,
			"dateFormat",
			new Set<ImportTemplateConfig["dateFormat"]>([
				"dd/mm/yyyy",
				"dd-mm-yyyy",
				"yyyy-mm-dd",
			]),
		),
		decimalSeparator: enumField(
			formData,
			"decimalSeparator",
			new Set<ImportTemplateConfig["decimalSeparator"]>(["auto", ",", "."]),
		),
		amountMode,
		dateColumn: requiredString(formData, "dateColumn"),
		descriptionColumn: requiredString(formData, "descriptionColumn"),
		amountColumn:
			amountMode === "signed" ? requiredString(formData, "amountColumn") : null,
		incomeAmountColumn:
			amountMode === "separate"
				? requiredString(formData, "incomeAmountColumn")
				: null,
		expenseAmountColumn:
			amountMode === "separate"
				? requiredString(formData, "expenseAmountColumn")
				: null,
		kindColumn: optionalString(formData, "kindColumn"),
		externalIdColumn: optionalString(formData, "externalIdColumn"),
		categoryColumn: optionalString(formData, "categoryColumn"),
		notesColumn: optionalString(formData, "notesColumn"),
		incomeTokens: csvTokens(
			optionalString(formData, "incomeTokens"),
			defaultTemplateConfig.incomeTokens,
		),
		expenseTokens: csvTokens(
			optionalString(formData, "expenseTokens"),
			defaultTemplateConfig.expenseTokens,
		),
		invertSign: formData.get("invertSign") === "on",
	});
}

export async function createImportTemplate(formData: FormData) {
	const userId = await requireUserId();
	await db.insert(importTemplates).values({
		userId,
		name: requiredString(formData, "name"),
		sourceLabel: sensitiveOptional(formData, "sourceLabel"),
		config: templateConfigFromForm(formData),
	});
	revalidatePath("/import");
}

export async function updateImportTemplate(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(importTemplates)
		.set({
			name: requiredString(formData, "name"),
			sourceLabel: sensitiveOptional(formData, "sourceLabel"),
			config: templateConfigFromForm(formData),
		})
		.where(
			and(
				eq(importTemplates.id, intField(formData, "id")),
				eq(importTemplates.userId, userId),
				eq(importTemplates.isArchived, false),
			),
		);
	revalidatePath("/import");
}

export async function archiveImportTemplate(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(importTemplates)
		.set({ isArchived: true })
		.where(
			and(
				eq(importTemplates.id, intField(formData, "id")),
				eq(importTemplates.userId, userId),
			),
		);
	revalidatePath("/import");
}

async function activeImportRules(userId: string) {
	const [rules, activeCategories, activeAccounts] = await Promise.all([
		db
			.select()
			.from(importCategoryRules)
			.where(
				and(
					eq(importCategoryRules.userId, userId),
					eq(importCategoryRules.isArchived, false),
				),
			),
		db
			.select()
			.from(categories)
			.where(
				and(eq(categories.userId, userId), eq(categories.isArchived, false)),
			),
		db
			.select()
			.from(financialAccounts)
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.isArchived, false),
				),
			),
	]);
	const categoryById = new Map(
		activeCategories.map((category) => [category.id, category]),
	);
	const accountIds = new Set(activeAccounts.map((account) => account.id));
	return rules.filter((rule) => {
		if (rule.accountId !== null && !accountIds.has(rule.accountId))
			return false;
		if (
			rule.sourceAccountId !== null &&
			!accountIds.has(rule.sourceAccountId)
		) {
			return false;
		}
		if (
			rule.destinationAccountId !== null &&
			!accountIds.has(rule.destinationAccountId)
		) {
			return false;
		}
		if (rule.action === "ignore") return true;
		if (rule.action === "transfer") {
			return (
				(rule.movementType === "income" || rule.movementType === "expense") &&
				rule.sourceAccountId !== null &&
				rule.destinationAccountId !== null &&
				rule.sourceAccountId !== rule.destinationAccountId
			);
		}
		if (rule.categoryId === null) return false;
		const category = categoryById.get(rule.categoryId);
		return !!category && category.kind === rule.movementType;
	});
}

async function activeRecurrencesAndConfirmedOccurrences(userId: string) {
	const [activeRecurrences, confirmedOccurrences] = await Promise.all([
		db
			.select()
			.from(recurrences)
			.where(
				and(eq(recurrences.userId, userId), eq(recurrences.isArchived, false)),
			),
		db
			.select({
				recurrenceId: transactions.recurrenceId,
				occurrenceOn: transactions.recurrenceOccurrenceOn,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.isArchived, false),
					sql`${transactions.recurrenceId} IS NOT NULL`,
				),
			),
	]);
	return {
		activeRecurrences,
		confirmedOccurrences: confirmedOccurrences.flatMap((occurrence) =>
			occurrence.recurrenceId && occurrence.occurrenceOn
				? [
						{
							recurrenceId: occurrence.recurrenceId,
							occurrenceOn: occurrence.occurrenceOn,
						},
					]
				: [],
		),
	};
}

async function reprocessReviewingImportRows(userId: string) {
	const reviewingBatches = await db
		.select({ id: importBatches.id })
		.from(importBatches)
		.where(
			and(
				eq(importBatches.userId, userId),
				eq(importBatches.status, "reviewing"),
			),
		);
	const rows = await db
		.select({
			id: importRows.id,
			batchId: importRows.batchId,
			accountId: importRows.accountId,
			movementType: importRows.movementType,
			normalizedDescription: importRows.normalizedDescription,
			amountCents: importRows.amountCents,
		})
		.from(importRows)
		.innerJoin(importBatches, eq(importRows.batchId, importBatches.id))
		.where(
			and(
				eq(importRows.userId, userId),
				eq(importRows.status, "pending_review"),
				eq(importBatches.status, "reviewing"),
			),
		);
	const rules = await activeImportRules(userId);
	const suggestionCounts = new Map<number, number>();
	for (const row of rows) {
		if (row.accountId === null) continue;
		const rule = matchImportCategoryRule(
			{ ...row, accountId: row.accountId },
			rules,
		);
		if (rule) {
			suggestionCounts.set(
				row.batchId,
				(suggestionCounts.get(row.batchId) ?? 0) + 1,
			);
		}
		const isIgnoreRule = rule?.action === "ignore";
		await db
			.update(importRows)
			.set({
				suggestedCategoryId:
					isIgnoreRule || rule?.action === "transfer"
						? null
						: (rule?.categoryId ?? null),
				suggestedSourceAccountId:
					rule?.action === "transfer" ? rule.sourceAccountId : null,
				suggestedDestinationAccountId:
					rule?.action === "transfer" ? rule.destinationAccountId : null,
				suggestedRuleId: rule?.id ?? null,
				suggestedDescription: isIgnoreRule
					? null
					: (rule?.descriptionOverride ?? null),
				suggestionSource: rule ? (isIgnoreRule ? "rule_ignore" : "rule") : null,
				...(isIgnoreRule || rule?.action === "transfer"
					? {
							suggestedRecurrenceId: null,
							suggestedRecurrenceOccurrenceOn: null,
						}
					: {}),
			})
			.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
	}
	for (const batch of reviewingBatches) {
		await db
			.update(importBatches)
			.set({ suggestionCount: suggestionCounts.get(batch.id) ?? 0 })
			.where(
				and(eq(importBatches.id, batch.id), eq(importBatches.userId, userId)),
			);
	}
}

async function createImportRuleIfMissing(input: {
	userId: string;
	action: ImportRuleAction;
	categoryId: number | null;
	accountId: number | null;
	sourceAccountId: number | null;
	destinationAccountId: number | null;
	movementType: "income" | "expense" | "transfer" | null;
	description: string;
	textMatchMode: "contains" | "exact";
	amountCents: number | null;
	amountToleranceCents: number | null;
	descriptionOverride: string | null;
	priority: number;
}) {
	const normalizedDescription = normalizeDescription(input.description);
	if (!normalizedDescription) return;
	const existing = await db
		.select()
		.from(importCategoryRules)
		.where(eq(importCategoryRules.userId, input.userId));
	if (
		existing.some(
			(rule) =>
				rule.action === input.action &&
				rule.categoryId === input.categoryId &&
				rule.accountId === input.accountId &&
				rule.sourceAccountId === input.sourceAccountId &&
				rule.destinationAccountId === input.destinationAccountId &&
				rule.movementType === input.movementType &&
				rule.textMatchMode === input.textMatchMode &&
				rule.normalizedDescription === normalizedDescription &&
				rule.amountCents === input.amountCents &&
				rule.amountToleranceCents === input.amountToleranceCents &&
				rule.descriptionOverride === input.descriptionOverride,
		)
	) {
		return;
	}
	await db.insert(importCategoryRules).values({
		userId: input.userId,
		action: input.action,
		categoryId: input.categoryId,
		accountId: input.accountId,
		sourceAccountId: input.sourceAccountId,
		destinationAccountId: input.destinationAccountId,
		movementType: input.movementType,
		normalizedDescription,
		textMatchMode: input.textMatchMode,
		amountCents: input.amountCents,
		amountToleranceCents: input.amountToleranceCents,
		descriptionOverride: input.descriptionOverride,
		priority: input.priority,
	});
}

export async function createImportCategoryRule(formData: FormData) {
	const userId = await requireUserId();
	const action = enumField(formData, "action", importRuleActions);
	const textMatchMode = enumField(
		formData,
		"textMatchMode",
		importRuleTextMatchModes,
	);
	const normalizedDescription = normalizeDescription(
		requiredString(formData, "description"),
	);
	if (!normalizedDescription) throw new Error("Texto da regra obrigatório");
	const accountId = optionalIntField(formData, "accountId");
	const amountValue = optionalString(formData, "amount");
	const amountCents = amountValue
		? moneyToCents(amountValue, { allowZero: false })
		: null;
	const toleranceValue = optionalString(formData, "amountTolerance");
	if (toleranceValue && !amountCents) {
		throw new Error("Valor aproximado obrigatório para usar tolerância");
	}
	const amountToleranceCents = toleranceValue
		? moneyToCents(toleranceValue, { allowZero: true })
		: null;
	const descriptionOverride = sensitiveOptional(
		formData,
		"descriptionOverride",
	);
	const priority = optionalIntField(formData, "priority") ?? 0;
	let categoryId: number | null = null;
	let sourceAccountId: number | null = null;
	let destinationAccountId: number | null = null;
	let movementType: "income" | "expense" | "transfer" | null = null;
	// Import rules today only match income/expense rows from CSV; credit-card
	// payments still need manual classification each import.
	const ruleRowMovementTypes = new Set<"income" | "expense" | "transfer">([
		"income",
		"expense",
		"transfer",
	]);
	if (action === "categorize") {
		categoryId = intField(formData, "categoryId");
		const rawMovementType = enumField(
			formData,
			"movementType",
			ruleRowMovementTypes,
		);
		if (rawMovementType === "transfer")
			throw new Error("Categoria não aceita transferência");
		movementType = rawMovementType;
	} else if (action === "transfer") {
		sourceAccountId = intField(formData, "sourceAccountId");
		destinationAccountId = intField(formData, "destinationAccountId");
		const rawMovementType = enumField(
			formData,
			"movementType",
			ruleRowMovementTypes,
		);
		if (rawMovementType === "transfer") {
			throw new Error(
				"Regra de transferência deve casar entrada ou saída do CSV",
			);
		}
		movementType = rawMovementType;
	} else {
		const rawMovementType = optionalString(formData, "movementType");
		if (rawMovementType && rawMovementType !== "any") {
			if (
				!ruleRowMovementTypes.has(
					rawMovementType as "income" | "expense" | "transfer",
				)
			)
				throw new Error("Tipo da linha inválido");
			movementType = rawMovementType as "income" | "expense" | "transfer";
		}
	}
	const [category, account, sourceAccount, destinationAccount] =
		await Promise.all([
			categoryId
				? db.query.categories.findFirst({
						where: and(
							eq(categories.id, categoryId),
							eq(categories.userId, userId),
							eq(categories.isArchived, false),
						),
					})
				: Promise.resolve(null),
			accountId
				? db.query.financialAccounts.findFirst({
						where: and(
							eq(financialAccounts.id, accountId),
							eq(financialAccounts.userId, userId),
							eq(financialAccounts.isArchived, false),
						),
					})
				: Promise.resolve(null),
			sourceAccountId
				? db.query.financialAccounts.findFirst({
						where: and(
							eq(financialAccounts.id, sourceAccountId),
							eq(financialAccounts.userId, userId),
							eq(financialAccounts.isArchived, false),
						),
					})
				: Promise.resolve(null),
			destinationAccountId
				? db.query.financialAccounts.findFirst({
						where: and(
							eq(financialAccounts.id, destinationAccountId),
							eq(financialAccounts.userId, userId),
							eq(financialAccounts.isArchived, false),
						),
					})
				: Promise.resolve(null),
		]);
	if (action === "categorize") {
		if (!category || category.kind !== movementType)
			throw new Error("Categoria inválida");
	}
	if (accountId && !account) throw new Error("Conta inválida");
	if (sourceAccountId && !sourceAccount)
		throw new Error("Conta origem inválida");
	if (destinationAccountId && !destinationAccount)
		throw new Error("Conta destino inválida");
	if (sourceAccountId && destinationAccountId === sourceAccountId)
		throw new Error("Conta origem e destino devem ser diferentes");
	const before = await db
		.select({ id: importCategoryRules.id })
		.from(importCategoryRules)
		.where(eq(importCategoryRules.userId, userId));
	await createImportRuleIfMissing({
		userId,
		action,
		categoryId,
		accountId,
		sourceAccountId,
		destinationAccountId,
		movementType,
		description: normalizedDescription,
		textMatchMode,
		amountCents,
		amountToleranceCents,
		descriptionOverride,
		priority,
	});
	const after = await db
		.select({ id: importCategoryRules.id })
		.from(importCategoryRules)
		.where(eq(importCategoryRules.userId, userId));
	if (after.length === before.length) throw new Error("Regra duplicada");
	await reprocessReviewingImportRows(userId);
	revalidatePath("/import");
}

export async function archiveImportCategoryRule(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(importCategoryRules)
		.set({ isArchived: true })
		.where(
			and(
				eq(importCategoryRules.id, intField(formData, "id")),
				eq(importCategoryRules.userId, userId),
			),
		);
	await reprocessReviewingImportRows(userId);
	revalidatePath("/import");
}

export type CreateImportBatchState = {
	error: string | null;
};

function isRedirectError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"digest" in error &&
		typeof error.digest === "string" &&
		error.digest.startsWith("NEXT_REDIRECT")
	);
}

export async function createImportBatchWithState(
	_prevState: CreateImportBatchState,
	formData: FormData,
): Promise<CreateImportBatchState> {
	try {
		await createImportBatch(formData);
		return { error: null };
	} catch (error) {
		if (isRedirectError(error)) throw error;
		return {
			error:
				error instanceof Error && error.message
					? error.message
					: "Não foi possível criar importação",
		};
	}
}

export async function createImportBatch(formData: FormData) {
	const userId = await requireUserId();
	const accountId = optionalIntField(formData, "accountId");
	const cardId = optionalIntField(formData, "cardId");
	if ((accountId === null) === (cardId === null)) {
		throw new Error("Escolha uma conta ou um cartão para importar");
	}
	const templateId = intField(formData, "templateId");
	const file = formData.get("csvFile");
	if (!(file instanceof File)) throw new Error("Arquivo CSV obrigatório");
	if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Use CSV");

	const [account, template] = await Promise.all([
		accountId
			? db.query.financialAccounts.findFirst({
					where: and(
						eq(financialAccounts.id, accountId),
						eq(financialAccounts.userId, userId),
					),
				})
			: null,
		db.query.importTemplates.findFirst({
			where: and(
				eq(importTemplates.id, templateId),
				eq(importTemplates.userId, userId),
			),
		}),
	]);
	if (
		accountId &&
		(!account || account.isArchived || account.type === "credit_card")
	) {
		throw new Error("Conta inválida");
	}
	if (!template || template.isArchived) {
		throw new Error("Modelo de importação inválido");
	}
	const invoice = cardId
		? (
				await ensureCardInvoice(db, {
					userId,
					cardId,
					monthKey: invoiceMonthKeyField(formData, "invoiceMonthKey"),
				})
			).invoice
		: null;

	const config = normalizeImportTemplateConfig(template.config);
	const parsedRows = parseImportCsv(await file.text(), config);
	const existingTransactions = accountId
		? await db
				.select({
					accountId: transactions.accountId,
					cardInvoiceId: transactions.cardInvoiceId,
					occurredOn: transactions.occurredOn,
					amountCents: transactions.amountCents,
					movementType: transactions.movementType,
					externalId: transactions.externalId,
					originalDescription: transactions.originalDescription,
					description: transactions.description,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.userId, userId),
						eq(transactions.accountId, accountId),
						eq(transactions.isArchived, false),
					),
				)
		: invoice
			? await db
					.select({
						accountId: transactions.accountId,
						cardInvoiceId: transactions.cardInvoiceId,
						occurredOn: transactions.occurredOn,
						amountCents: transactions.amountCents,
						movementType: transactions.movementType,
						externalId: transactions.externalId,
						originalDescription: transactions.originalDescription,
						description: transactions.description,
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.cardInvoiceId, invoice.id),
							eq(transactions.isArchived, false),
						),
					)
			: [];
	const previousActiveBatches = accountId
		? await db
				.select({ id: importBatches.id })
				.from(importBatches)
				.where(
					and(
						eq(importBatches.userId, userId),
						eq(importBatches.accountId, accountId),
						or(
							eq(importBatches.status, "reviewing"),
							eq(importBatches.status, "confirmed"),
						),
					),
				)
		: invoice
			? await db
					.select({ id: importBatches.id })
					.from(importBatches)
					.where(
						and(
							eq(importBatches.userId, userId),
							eq(importBatches.cardInvoiceId, invoice.id),
							or(
								eq(importBatches.status, "reviewing"),
								eq(importBatches.status, "confirmed"),
							),
						),
					)
			: [];
	const previousActiveBatchIds = new Set(
		previousActiveBatches.map((batch) => batch.id),
	);
	const previousImportRows = accountId
		? await db
				.select({
					batchId: importRows.batchId,
					accountId: importRows.accountId,
					cardInvoiceId: importRows.cardInvoiceId,
					status: importRows.status,
					occurredOn: importRows.occurredOn,
					amountCents: importRows.amountCents,
					movementType: importRows.movementType,
					externalId: importRows.externalId,
					normalizedDescription: importRows.normalizedDescription,
				})
				.from(importRows)
				.where(
					and(
						eq(importRows.userId, userId),
						eq(importRows.accountId, accountId),
					),
				)
		: invoice
			? await db
					.select({
						batchId: importRows.batchId,
						accountId: importRows.accountId,
						cardInvoiceId: importRows.cardInvoiceId,
						status: importRows.status,
						occurredOn: importRows.occurredOn,
						amountCents: importRows.amountCents,
						movementType: importRows.movementType,
						externalId: importRows.externalId,
						normalizedDescription: importRows.normalizedDescription,
					})
					.from(importRows)
					.where(
						and(
							eq(importRows.userId, userId),
							eq(importRows.cardInvoiceId, invoice.id),
						),
					)
			: [];
	const [rules, recurrenceContext] = await Promise.all([
		activeImportRules(userId),
		activeRecurrencesAndConfirmedOccurrences(userId),
	]);

	const [batch] = await db
		.insert(importBatches)
		.values({
			userId,
			importTemplateId: template.id,
			accountId,
			cardId,
			cardInvoiceId: invoice?.id ?? null,
			status: "reviewing",
			originalFileName: maskSensitive(file.name).slice(0, 255),
			sourceLabel: template.sourceLabel
				? maskSensitive(template.sourceLabel)
				: template.sourceLabel,
			rowCount: parsedRows.length,
			rawFileStored: false,
		})
		.returning();
	if (!batch) throw new Error("Não foi possível criar importação");

	const { rowValues, suggestionCount, suggestedRuleMatchCounts } =
		buildImportBatchRows({
			userId,
			batchId: batch.id,
			accountId,
			cardId,
			cardInvoiceId: invoice?.id ?? null,
			parsedRows,
			existingTransactions,
			previousImportRows,
			previousActiveBatchIds,
			rules,
			recurrenceContext,
		});
	if (rowValues.length > 0) {
		await db.insert(importRows).values(rowValues);
	}
	if (suggestionCount > 0) {
		await db
			.update(importBatches)
			.set({ suggestionCount })
			.where(
				and(eq(importBatches.id, batch.id), eq(importBatches.userId, userId)),
			);
		for (const [ruleId, count] of suggestedRuleMatchCounts) {
			const rule = rules.find((candidate) => candidate.id === ruleId);
			if (!rule) continue;
			await db
				.update(importCategoryRules)
				.set({ matchCount: rule.matchCount + count })
				.where(
					and(
						eq(importCategoryRules.id, ruleId),
						eq(importCategoryRules.userId, userId),
					),
				);
		}
	}

	revalidatePath("/import");
	redirect(`/import?batchId=${batch.id}`);
}

export type ConfirmImportBatchState = {
	rowErrors: Record<number, string>;
	globalError: string | null;
};

const confirmImportBatchInitialState: ConfirmImportBatchState = {
	rowErrors: {},
	globalError: null,
};

export async function confirmImportBatch(
	_prevState: ConfirmImportBatchState,
	formData: FormData,
): Promise<ConfirmImportBatchState> {
	const userId = await requireUserId();
	const batchId = intField(formData, "batchId");
	const batch = await db.query.importBatches.findFirst({
		where: and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
	});
	if (!batch || batch.status !== "reviewing")
		return { rowErrors: {}, globalError: "Importação inválida" };

	const rows = await db.query.importRows.findMany({
		where: and(eq(importRows.batchId, batchId), eq(importRows.userId, userId)),
	});
	const [activeAccounts, activeCategories, activeCards] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.isArchived, false),
				),
			),
		db
			.select()
			.from(categories)
			.where(
				and(eq(categories.userId, userId), eq(categories.isArchived, false)),
			),
		db
			.select()
			.from(creditCards)
			.where(
				and(
					eq(creditCards.userId, userId),
					eq(creditCards.isArchived, false),
					eq(creditCards.isActive, true),
				),
			),
	]);
	const accountsById = new Map(
		activeAccounts.map((account) => [account.id, account]),
	);
	const categoriesById = new Map(
		activeCategories.map((category) => [category.id, category]),
	);
	const cardsById = new Map(activeCards.map((card) => [card.id, card]));
	const confirmCategoriesById = new Map<number, ImportConfirmCategory>(
		activeCategories.map((category) => [
			category.id,
			{ id: category.id, name: category.name, kind: category.kind },
		]),
	);
	const bulkCategoryId = optionalIntField(formData, "bulkCategoryId");

	// Pre-pass: surface per-row validation before opening the transaction so
	// the review screen can show inline errors instead of a blanket digest crash.
	const rowErrors: Record<number, string> = {};
	for (const row of rows) {
		const decision = formData.get(`row-${row.id}-decision`)?.toString();
		if (decision !== "import") continue;
		const movementTypeValue = formData
			.get(`row-${row.id}-movementType`)
			?.toString();
		if (
			!movementTypeValue ||
			!importMovementTypes.has(
				movementTypeValue as
					| "income"
					| "expense"
					| "transfer"
					| "credit_card_payment",
			)
		)
			continue;
		const movementType = movementTypeValue as
			| "income"
			| "expense"
			| "transfer"
			| "credit_card_payment";
		const rowCategoryId = optionalIntField(
			formData,
			`row-${row.id}-categoryId`,
		);
		const resolved = resolveConfirmRowCategory({
			movementType,
			rowCategoryId,
			bulkCategoryId,
			categoriesById: confirmCategoriesById,
		});
		if (resolved.kind !== "ok") {
			rowErrors[row.id] = formatConfirmCategoryError(resolved, movementType);
			continue;
		}
		if (movementType === "transfer" || movementType === "credit_card_payment") {
			const sourceAccountId = optionalIntField(
				formData,
				`row-${row.id}-accountId`,
			);
			const source = sourceAccountId ? accountsById.get(sourceAccountId) : null;
			if (!sourceAccountId || !source || source.type === "credit_card") {
				rowErrors[row.id] = "Conta origem obrigatória.";
				continue;
			}
			if (movementType === "credit_card_payment") {
				const cardId = optionalIntField(formData, `row-${row.id}-cardId`);
				if (!cardId || !cardsById.has(cardId)) {
					rowErrors[row.id] = "Cartão obrigatório para pagamento de fatura.";
					continue;
				}
				const monthKeyValue = formData
					.get(`row-${row.id}-invoiceMonthKey`)
					?.toString();
				if (!monthKeyValue || !parseMonthKey(monthKeyValue)) {
					rowErrors[row.id] = "Mês da fatura obrigatório no formato AAAA-MM.";
				}
				continue;
			}
			const destinationAccountId = optionalIntField(
				formData,
				`row-${row.id}-destinationAccountId`,
			);
			if (!destinationAccountId || !accountsById.has(destinationAccountId)) {
				rowErrors[row.id] = "Conta destino obrigatória para transferência.";
				continue;
			}
			if (sourceAccountId === destinationAccountId) {
				rowErrors[row.id] = "Conta origem e destino devem ser diferentes.";
			}
		}
	}
	if (Object.keys(rowErrors).length > 0) {
		return {
			rowErrors,
			globalError: `Corrija ${Object.keys(rowErrors).length} linha(s) antes de confirmar.`,
		};
	}

	const rulesFromCorrections: Parameters<
		typeof createImportRuleIfMissing
	>[0][] = [];

	await db.transaction(async (tx) => {
		let suggestionAcceptedCount = 0;
		let suggestionRejectedCount = 0;
		let suggestionOverriddenCount = 0;
		const ruleCounters = new Map<
			number,
			{ accepted: number; rejected: number; overridden: number }
		>();
		const countRuleSuggestion = (
			ruleId: number | null,
			kind: "accepted" | "rejected" | "overridden",
		) => {
			if (!ruleId) return;
			const counters = ruleCounters.get(ruleId) ?? {
				accepted: 0,
				rejected: 0,
				overridden: 0,
			};
			counters[kind]++;
			ruleCounters.set(ruleId, counters);
		};
		const acceptedRecurrenceKeys = new Set<string>();
		for (const row of rows) {
			const decision = formData.get(`row-${row.id}-decision`)?.toString();
			if (!decision)
				throw new Error(`Decisão obrigatória na linha ${row.rowNumber}`);

			const isIgnoreSuggestion = row.suggestionSource === "rule_ignore";
			if (decision === "ignore") {
				if (isIgnoreSuggestion) {
					suggestionAcceptedCount++;
					countRuleSuggestion(row.suggestedRuleId, "accepted");
				} else if (row.suggestedCategoryId) {
					suggestionRejectedCount++;
					countRuleSuggestion(row.suggestedRuleId, "rejected");
				}
				if (formData.get(`row-${row.id}-createRule`) === "on") {
					rulesFromCorrections.push({
						userId,
						action: "ignore",
						categoryId: null,
						accountId: row.accountId,
						sourceAccountId: null,
						destinationAccountId: null,
						movementType:
							row.movementType === "income" || row.movementType === "expense"
								? row.movementType
								: null,
						description:
							row.normalizedDescription || row.originalDescription || "",
						textMatchMode: "contains",
						amountCents: null,
						amountToleranceCents: null,
						descriptionOverride: null,
						priority: 0,
					});
				}
				await tx
					.update(importRows)
					.set({
						status: "ignored",
						suggestedRecurrenceId: null,
						suggestedRecurrenceOccurrenceOn: null,
					})
					.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
				continue;
			}
			if (decision === "duplicate") {
				if (isIgnoreSuggestion) {
					suggestionRejectedCount++;
					countRuleSuggestion(row.suggestedRuleId, "rejected");
				} else if (row.suggestedCategoryId) {
					suggestionRejectedCount++;
					countRuleSuggestion(row.suggestedRuleId, "rejected");
				}
				await tx
					.update(importRows)
					.set({
						status: "duplicate",
						suggestedRecurrenceId: null,
						suggestedRecurrenceOccurrenceOn: null,
					})
					.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
				continue;
			}
			if (decision !== "import") throw new Error("Decisão inválida");

			const occurredOn = isoDateField(formData, `row-${row.id}-occurredOn`);
			const amountCents = moneyToCents(
				requiredString(formData, `row-${row.id}-amount`),
				{ allowZero: false },
			);
			const movementType = enumField(
				formData,
				`row-${row.id}-movementType`,
				importMovementTypes,
			);
			const isCardExpense =
				movementType === "expense" &&
				row.cardId !== null &&
				row.cardInvoiceId !== null;
			const isTransferLike =
				movementType === "transfer" || movementType === "credit_card_payment";
			const accountId = isCardExpense
				? null
				: intField(
						formData,
						`row-${row.id}-accountId`,
						row.accountId ?? undefined,
					);
			if (accountId !== null && !accountsById.has(accountId)) {
				throw new Error(`Conta inválida na linha ${row.rowNumber}`);
			}
			const destinationAccountId = optionalIntField(
				formData,
				`row-${row.id}-destinationAccountId`,
			);
			const paymentCardId = optionalIntField(formData, `row-${row.id}-cardId`);
			const paymentInvoiceMonthKeyValue = formData
				.get(`row-${row.id}-invoiceMonthKey`)
				?.toString();
			const paymentInvoiceMonthKey = paymentInvoiceMonthKeyValue
				? parseMonthKey(paymentInvoiceMonthKeyValue)
				: null;
			let paymentInvoice: typeof cardInvoices.$inferSelect | null = null;
			if (movementType === "transfer") {
				if (!destinationAccountId || !accountsById.has(destinationAccountId)) {
					throw new Error(
						`Conta destino obrigatória na linha ${row.rowNumber}`,
					);
				}
				if (destinationAccountId === accountId) {
					throw new Error(
						`Conta origem e destino devem ser diferentes na linha ${row.rowNumber}`,
					);
				}
			}
			if (movementType === "credit_card_payment") {
				if (!accountId) {
					throw new Error(
						`Pagamento de fatura na linha ${row.rowNumber} exige conta origem`,
					);
				}
				if (!paymentCardId || !cardsById.has(paymentCardId)) {
					throw new Error(
						`Pagamento de fatura na linha ${row.rowNumber} exige cartão`,
					);
				}
				if (!paymentInvoiceMonthKey) {
					throw new Error(
						`Pagamento de fatura na linha ${row.rowNumber} exige mês da fatura`,
					);
				}
				const ensured = await ensureCardInvoice(tx as unknown as typeof db, {
					userId,
					cardId: paymentCardId,
					monthKey: paymentInvoiceMonthKey,
				});
				paymentInvoice = ensured.invoice;
			}
			const rowCategoryId = optionalIntField(
				formData,
				`row-${row.id}-categoryId`,
			);
			const categoryId = isTransferLike
				? null
				: (rowCategoryId ?? bulkCategoryId);
			const category = categoryId ? categoriesById.get(categoryId) : null;
			if (!isTransferLike && !category)
				throw new Error(`Categoria obrigatória na linha ${row.rowNumber}`);
			const acceptedRuleId =
				row.suggestedRuleId &&
				((movementType === "transfer" &&
					row.suggestedSourceAccountId === accountId &&
					row.suggestedDestinationAccountId === destinationAccountId) ||
					(row.suggestedCategoryId && category?.id === row.suggestedCategoryId))
					? row.suggestedRuleId
					: null;
			if (isIgnoreSuggestion) {
				suggestionRejectedCount++;
				countRuleSuggestion(row.suggestedRuleId, "rejected");
			} else if (
				row.suggestedCategoryId ||
				row.suggestedSourceAccountId ||
				row.suggestedDestinationAccountId
			) {
				if (acceptedRuleId) {
					suggestionAcceptedCount++;
					countRuleSuggestion(acceptedRuleId, "accepted");
				} else {
					suggestionRejectedCount++;
					suggestionOverriddenCount++;
					countRuleSuggestion(row.suggestedRuleId, "rejected");
					countRuleSuggestion(row.suggestedRuleId, "overridden");
				}
			}
			if (category && category.kind !== movementType) {
				throw new Error(`Categoria incompatível na linha ${row.rowNumber}`);
			}
			const description = maskSensitive(
				formData.get(`row-${row.id}-description`)?.toString().trim() ||
					row.suggestedDescription ||
					row.originalDescription ||
					row.normalizedDescription ||
					"Importação CSV",
			);
			// Auto-generated rules only support categorize/ignore/transfer today.
			// Credit-card invoice payments still require manual classification per
			// import; the user can save one as a transfer rule with credit_card
			// destination from a future iteration if needed.
			if (
				formData.get(`row-${row.id}-createRule`) === "on" &&
				movementType !== "credit_card_payment"
			) {
				const ruleMovementType =
					movementType === "transfer" &&
					(row.movementType === "income" || row.movementType === "expense")
						? row.movementType
						: movementType;
				rulesFromCorrections.push({
					userId,
					action: movementType === "transfer" ? "transfer" : "categorize",
					categoryId: category?.id ?? null,
					accountId: movementType === "transfer" ? row.accountId : accountId,
					sourceAccountId: movementType === "transfer" ? accountId : null,
					destinationAccountId:
						movementType === "transfer" ? destinationAccountId : null,
					movementType: ruleMovementType,
					description,
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
					descriptionOverride: null,
					priority: 0,
				});
			}
			const acceptedRecurrence =
				row.suggestedRecurrenceId &&
				row.suggestedRecurrenceOccurrenceOn &&
				formData.get(`row-${row.id}-acceptRecurrence`) === "on"
					? {
							recurrenceId: row.suggestedRecurrenceId,
							occurrenceOn: row.suggestedRecurrenceOccurrenceOn,
						}
					: null;
			if (acceptedRecurrence) {
				const recurrenceKey = `${acceptedRecurrence.recurrenceId}:${acceptedRecurrence.occurrenceOn}`;
				if (acceptedRecurrenceKeys.has(recurrenceKey)) {
					throw new Error(
						`Duas linhas do lote apontam para a mesma recorrência na linha ${row.rowNumber}; rejeite uma sugestão.`,
					);
				}
				const existingOccurrence = await tx.query.transactions.findFirst({
					where: and(
						eq(transactions.userId, userId),
						eq(transactions.recurrenceId, acceptedRecurrence.recurrenceId),
						eq(
							transactions.recurrenceOccurrenceOn,
							acceptedRecurrence.occurrenceOn,
						),
						eq(transactions.isArchived, false),
					),
				});
				if (existingOccurrence) {
					throw new Error(
						`A recorrência sugerida na linha ${row.rowNumber} já foi confirmada; rejeite a sugestão.`,
					);
				}
				acceptedRecurrenceKeys.add(recurrenceKey);
			}

			await tx.insert(transactions).values({
				userId,
				accountId,
				destinationAccountId:
					movementType === "transfer" ? destinationAccountId : null,
				cardId: isCardExpense
					? row.cardId
					: movementType === "credit_card_payment"
						? (paymentInvoice?.cardId ?? null)
						: null,
				cardInvoiceId: isCardExpense
					? row.cardInvoiceId
					: movementType === "credit_card_payment"
						? (paymentInvoice?.id ?? null)
						: null,
				cardEntryKind: isCardExpense ? "charge" : null,
				categoryId,
				categoryRuleId: acceptedRuleId,
				importBatchId: batch.id,
				importRowId: row.id,
				recurrenceId: acceptedRecurrence?.recurrenceId ?? null,
				recurrenceOccurrenceOn: acceptedRecurrence?.occurrenceOn ?? null,
				movementType,
				status: "confirmed",
				amountCents,
				occurredOn,
				originalDescription: row.originalDescription,
				description,
				externalId: row.externalId,
			});
			await tx
				.update(importRows)
				.set({
					status: "imported",
					accountId: movementType === "transfer" ? row.accountId : accountId,
					occurredOn,
					amountCents,
					movementType,
					suggestedSourceAccountId: isTransferLike ? accountId : null,
					suggestedDestinationAccountId:
						movementType === "transfer" ? destinationAccountId : null,
					suggestedRecurrenceId: acceptedRecurrence?.recurrenceId ?? null,
					suggestedRecurrenceOccurrenceOn:
						acceptedRecurrence?.occurrenceOn ?? null,
				})
				.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
		}
		for (const [ruleId, counters] of ruleCounters) {
			await tx
				.update(importCategoryRules)
				.set({
					acceptedCount: sql`${importCategoryRules.acceptedCount} + ${counters.accepted}`,
					rejectedCount: sql`${importCategoryRules.rejectedCount} + ${counters.rejected}`,
					overriddenCount: sql`${importCategoryRules.overriddenCount} + ${counters.overridden}`,
				})
				.where(
					and(
						eq(importCategoryRules.id, ruleId),
						eq(importCategoryRules.userId, userId),
					),
				);
		}
		await tx
			.update(importBatches)
			.set({
				status: "confirmed",
				confirmedAt: new Date(),
				suggestionAcceptedCount,
				suggestionRejectedCount,
				suggestionOverriddenCount,
			})
			.where(
				and(eq(importBatches.id, batch.id), eq(importBatches.userId, userId)),
			);
		await recordAudit(tx, {
			userId,
			entityType: "import_batch",
			entityId: batch.id,
			action: "updated",
			summary: `Lote "${batch.originalFileName}" confirmado`,
			diff: [{ field: "status", from: "reviewing", to: "confirmed" }],
		});
	});

	for (const rule of rulesFromCorrections) {
		await createImportRuleIfMissing(rule);
	}
	if (rulesFromCorrections.length > 0)
		await reprocessReviewingImportRows(userId);

	await regenerateAssistantSuggestionsForUser(userId);

	invalidateAfterImportMutation(userId);
	revalidatePath("/import");
	revalidatePath("/assistente");
	revalidatePath("/transactions");
	revalidatePath("/cash-flow");
	revalidatePath("/budgets");
	revalidatePath("/analysis");
	revalidatePath("/reports");
	return confirmImportBatchInitialState;
}

export async function cancelImportBatch(formData: FormData) {
	const userId = await requireUserId();
	const batchId = intField(formData, "batchId");
	const batch = await db.query.importBatches.findFirst({
		where: and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
	});
	if (!batch || batch.status !== "reviewing") {
		throw new Error("Importação não pode ser cancelada");
	}
	await db.transaction(async (tx) => {
		await tx
			.update(importRows)
			.set({
				status: "ignored",
				suggestedRecurrenceId: null,
				suggestedRecurrenceOccurrenceOn: null,
			})
			.where(
				and(eq(importRows.batchId, batchId), eq(importRows.userId, userId)),
			);
		await tx
			.update(importBatches)
			.set({ status: "cancelled" })
			.where(
				and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
			);
		await recordAudit(tx, {
			userId,
			entityType: "import_batch",
			entityId: batchId,
			action: "updated",
			summary: `Lote "${batch.originalFileName}" cancelado`,
			diff: [{ field: "status", from: batch.status, to: "cancelled" }],
		});
	});
	revalidatePath("/import");
}

export async function revertImportBatch(formData: FormData) {
	const userId = await requireUserId();
	const batchId = intField(formData, "batchId");
	const batch = await db.query.importBatches.findFirst({
		where: and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
	});
	if (!batch || batch.status !== "confirmed")
		throw new Error("Importação não confirmada");

	await db.transaction(async (tx) => {
		const updatedTransactions = await tx
			.update(transactions)
			.set({
				isArchived: true,
				recurrenceId: null,
				recurrenceOccurrenceOn: null,
			})
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.importBatchId, batchId),
				),
			)
			.returning({ id: transactions.id });
		await tx
			.update(importBatches)
			.set({ status: "reverted" })
			.where(
				and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
			);
		await recordAudit(tx, {
			userId,
			entityType: "import_batch",
			entityId: batchId,
			action: "updated",
			summary: `Lote "${batch.originalFileName}" revertido (${updatedTransactions.length} transações arquivadas)`,
			diff: [{ field: "status", from: batch.status, to: "reverted" }],
		});
	});

	invalidateAfterImportMutation(userId);
	revalidatePath("/import");
}
