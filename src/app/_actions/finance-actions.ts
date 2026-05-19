"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
	type CategoryActionState,
	categoryActionError,
} from "~/lib/category-errors";
import { matchImportCategoryRule } from "~/lib/import-category-rules";
import {
	formatConfirmCategoryError,
	type ImportConfirmCategory,
	resolveConfirmRowCategory,
} from "~/lib/import-confirm";
import {
	defaultTemplateConfig,
	duplicateKey,
	type ImportTemplateConfig,
	normalizeDescription,
	normalizeImportTemplateConfig,
	parseImportCsv,
} from "~/lib/import-rules";
import { MAX_AMOUNT_CENTS, moneyToCents } from "~/lib/money";
import { matchImportedRowToRecurrence } from "~/lib/recurrences";
import { maskSensitive } from "~/lib/sensitive-data";
import { regenerateAssistantSuggestionsForUser } from "~/server/assistant";
import {
	diffTransaction,
	recordAudit,
	type TransactionAuditSnapshot,
} from "~/server/audit";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importRows,
	importTemplates,
	monthlyBudgets,
	recurrences,
	transactionSavedFilters,
	transactions,
} from "~/server/db/schema";

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
type ImportRuleTextMatchMode = "contains" | "exact";
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
const importRuleTextMatchModes = new Set<ImportRuleTextMatchMode>([
	"contains",
	"exact",
]);
const importMovementTypes = new Set<"income" | "expense">([
	"income",
	"expense",
]);
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
		categories: ["Salário", "Outras receitas"],
	},
	{
		name: "Moradia",
		kind: "expense" as const,
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
	if (!/^\d{4}-\d{2}$/.test(value)) throw new Error(`Mês inválido: ${name}`);
	return value;
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

function revalidateRecurrenceViews() {
	revalidatePath("/");
	revalidatePath("/cash-flow");
	revalidatePath("/recurrences");
}

function revalidateBudgetViews() {
	revalidatePath("/");
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
		creditCardClosingDay:
			type === "credit_card" ? cardDay(formData, "closingDay") : null,
		creditCardDueDay:
			type === "credit_card" ? cardDay(formData, "dueDay") : null,
	});
	revalidatePath("/");
}

export async function updateAccount(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const type = enumField(formData, "type", accountTypes);
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
			creditCardClosingDay:
				type === "credit_card" ? cardDay(formData, "closingDay") : null,
			creditCardDueDay:
				type === "credit_card" ? cardDay(formData, "dueDay") : null,
		})
		.where(
			and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId)),
		);
	revalidatePath("/");
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
	revalidatePath("/");
}

async function ensureDefaultCategoryGroup(
	userId: string,
	group: (typeof defaultGroups)[number],
) {
	const [inserted] = await db
		.insert(categoryGroups)
		.values({ userId, name: group.name, kind: group.kind })
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
		revalidatePath("/");
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
		});
		revalidatePath("/");
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
			.set({ name: requiredString(formData, "name") })
			.where(
				and(
					eq(categoryGroups.id, intField(formData, "id")),
					eq(categoryGroups.userId, userId),
				),
			);
		revalidatePath("/");
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
	revalidatePath("/");
}

export async function createCategory(
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
		await db.insert(categories).values({
			userId,
			groupId,
			kind: group.kind,
			name: requiredString(formData, "name"),
		});
		revalidatePath("/");
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
		revalidatePath("/");
		return { error: null };
	} catch (error) {
		return handleCategoryActionError(error);
	}
}

export async function archiveCategory(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(categories)
		.set({ isArchived: true })
		.where(
			and(
				eq(categories.id, intField(formData, "id")),
				eq(categories.userId, userId),
			),
		);
	revalidatePath("/");
}

async function transactionValues(userId: string, formData: FormData) {
	const movementType = enumField(formData, "movementType", movementTypes);
	const accountId = intField(formData, "accountId");
	const categoryId = optionalIntField(formData, "categoryId");
	const destinationAccountId = optionalIntField(
		formData,
		"destinationAccountId",
	);
	const account = await db.query.financialAccounts.findFirst({
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});
	const destinationAccount = destinationAccountId
		? await db.query.financialAccounts.findFirst({
				where: and(
					eq(financialAccounts.id, destinationAccountId),
					eq(financialAccounts.userId, userId),
				),
			})
		: null;
	const category = categoryId
		? await db.query.categories.findFirst({
				where: and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
				),
			})
		: null;
	const recurrenceId = optionalIntField(formData, "recurrenceId");
	const recurrenceOccurrenceOn = optionalIsoDateField(
		formData,
		"recurrenceOccurrenceOn",
	);
	const recurrence = recurrenceId
		? await db.query.recurrences.findFirst({
				where: and(
					eq(recurrences.id, recurrenceId),
					eq(recurrences.userId, userId),
				),
			})
		: null;

	if (!account || account.isArchived) throw new Error("Conta inválida");
	if (
		destinationAccountId &&
		(!destinationAccount || destinationAccount.isArchived)
	) {
		throw new Error("Conta destino inválida");
	}
	if (destinationAccountId === accountId) {
		throw new Error("Conta origem e destino devem ser diferentes");
	}
	if ((movementType === "income" || movementType === "expense") && !category) {
		throw new Error("Categoria é obrigatória para receita e despesa");
	}
	if (category?.isArchived)
		throw new Error("Categoria arquivada não pode receber lançamentos");
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
	if (
		(movementType === "transfer" || movementType === "credit_card_payment") &&
		!destinationAccount
	) {
		throw new Error(
			"Conta destino é obrigatória para transferência e pagamento de fatura",
		);
	}
	if (
		movementType === "transfer" &&
		destinationAccount?.type === "credit_card"
	) {
		throw new Error("Use pagamento de fatura para transferir para cartão");
	}
	if (movementType === "credit_card_payment") {
		if (
			account.type === "credit_card" ||
			destinationAccount?.type !== "credit_card"
		) {
			throw new Error(
				"Pagamento de fatura sai de conta normal e entra no cartão",
			);
		}
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

	return {
		userId,
		accountId,
		destinationAccountId,
		categoryId,
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
	revalidatePath("/");
	revalidatePath("/transactions");
}

export async function updateTransaction(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	const values = await transactionValues(userId, formData);
	await db.transaction(async (tx) => {
		const before = await tx.query.transactions.findFirst({
			where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
		});
		if (!before) throw new Error("Transação não encontrada");
		await tx
			.update(transactions)
			.set(values)
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
		const diff = diffTransaction(
			toTransactionSnapshot(before),
			toTransactionSnapshot({ ...before, ...values }),
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
	revalidatePath("/");
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
	revalidatePath("/");
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
	revalidatePath("/transactions");
	revalidatePath("/");
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
	revalidatePath("/transactions");
	revalidatePath("/");
}

function toTransactionSnapshot(row: {
	accountId: number;
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
	revalidateRecurrenceViews();
}

export async function updateRecurrence(formData: FormData) {
	const userId = await requireUserId();
	const id = intField(formData, "id");
	await db
		.update(recurrences)
		.set(await recurrenceValues(userId, formData))
		.where(and(eq(recurrences.id, id), eq(recurrences.userId, userId)));
	revalidateRecurrenceViews();
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
	revalidateRecurrenceViews();
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
	revalidateRecurrenceViews();
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
	revalidateRecurrenceViews();
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
	revalidateRecurrenceViews();
}

async function budgetValues(userId: string, formData: FormData) {
	const scope = enumField(formData, "scope", monthlyBudgetScopes);
	const categoryGroupId = optionalIntField(formData, "categoryGroupId");
	const categoryId = optionalIntField(formData, "categoryId");
	if (scope === "month" && (categoryGroupId !== null || categoryId !== null)) {
		throw new Error("Orçamento mensal não usa grupo ou categoria");
	}
	if (scope === "category_group" && (!categoryGroupId || categoryId !== null)) {
		throw new Error("Orçamento por grupo exige apenas grupo");
	}
	if (scope === "category" && (!categoryId || categoryGroupId !== null)) {
		throw new Error("Orçamento por categoria exige apenas categoria");
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

export async function createOrUpdateBudget(formData: FormData) {
	const userId = await requireUserId();
	const values = await budgetValues(userId, formData);
	await db
		.insert(monthlyBudgets)
		.values(values)
		.onConflictDoUpdate({
			set: {
				amountCents: values.amountCents,
				updatedAt: new Date(),
			},
			target: [
				monthlyBudgets.userId,
				monthlyBudgets.monthKey,
				monthlyBudgets.scope,
				monthlyBudgets.categoryGroupId,
				monthlyBudgets.categoryId,
			],
		});
	revalidateBudgetViews();
}

export async function deleteBudget(formData: FormData) {
	const userId = await requireUserId();
	await db
		.delete(monthlyBudgets)
		.where(
			and(
				eq(monthlyBudgets.id, intField(formData, "id")),
				eq(monthlyBudgets.userId, userId),
			),
		);
	revalidateBudgetViews();
}

export async function copyBudgetMonth(formData: FormData) {
	const userId = await requireUserId();
	const sourceMonthKey = monthKeyField(formData, "sourceMonthKey");
	const targetMonthKey = monthKeyField(formData, "targetMonthKey");
	if (sourceMonthKey === targetMonthKey) {
		throw new Error("Escolha meses diferentes para copiar orçamento");
	}
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
	revalidateBudgetViews();
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
		const category = categoryById.get(rule.categoryId);
		return (
			category &&
			category.kind === rule.movementType &&
			(rule.accountId === null || accountIds.has(rule.accountId))
		);
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
		const rule = matchImportCategoryRule(row, rules);
		if (rule) {
			suggestionCounts.set(
				row.batchId,
				(suggestionCounts.get(row.batchId) ?? 0) + 1,
			);
		}
		await db
			.update(importRows)
			.set({
				suggestedCategoryId: rule?.categoryId ?? null,
				suggestedRuleId: rule?.id ?? null,
				suggestionSource: rule ? "rule" : null,
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
	categoryId: number;
	accountId: number | null;
	movementType: "income" | "expense";
	description: string;
	textMatchMode: "contains" | "exact";
	amountCents: number | null;
	amountToleranceCents: number | null;
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
				rule.categoryId === input.categoryId &&
				rule.accountId === input.accountId &&
				rule.movementType === input.movementType &&
				rule.textMatchMode === input.textMatchMode &&
				rule.normalizedDescription === normalizedDescription &&
				rule.amountCents === input.amountCents &&
				rule.amountToleranceCents === input.amountToleranceCents,
		)
	) {
		return;
	}
	await db.insert(importCategoryRules).values({
		userId: input.userId,
		categoryId: input.categoryId,
		accountId: input.accountId,
		movementType: input.movementType,
		normalizedDescription,
		textMatchMode: input.textMatchMode,
		amountCents: input.amountCents,
		amountToleranceCents: input.amountToleranceCents,
		priority: input.priority,
	});
}

export async function createImportCategoryRule(formData: FormData) {
	const userId = await requireUserId();
	const categoryId = intField(formData, "categoryId");
	const movementType = enumField(formData, "movementType", importMovementTypes);
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
	const priority = optionalIntField(formData, "priority") ?? 0;
	const [category, account] = await Promise.all([
		db.query.categories.findFirst({
			where: and(
				eq(categories.id, categoryId),
				eq(categories.userId, userId),
				eq(categories.isArchived, false),
			),
		}),
		accountId
			? db.query.financialAccounts.findFirst({
					where: and(
						eq(financialAccounts.id, accountId),
						eq(financialAccounts.userId, userId),
						eq(financialAccounts.isArchived, false),
					),
				})
			: Promise.resolve(null),
	]);
	if (!category || category.kind !== movementType)
		throw new Error("Categoria inválida");
	if (accountId && !account) throw new Error("Conta inválida");
	const before = await db
		.select({ id: importCategoryRules.id })
		.from(importCategoryRules)
		.where(eq(importCategoryRules.userId, userId));
	await createImportRuleIfMissing({
		userId,
		categoryId,
		accountId,
		movementType,
		description: normalizedDescription,
		textMatchMode,
		amountCents,
		amountToleranceCents,
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

export async function createImportBatch(formData: FormData) {
	const userId = await requireUserId();
	const accountId = intField(formData, "accountId");
	const templateId = intField(formData, "templateId");
	const file = formData.get("csvFile");
	if (!(file instanceof File)) throw new Error("Arquivo CSV obrigatório");
	if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Use CSV");

	const [account, template] = await Promise.all([
		db.query.financialAccounts.findFirst({
			where: and(
				eq(financialAccounts.id, accountId),
				eq(financialAccounts.userId, userId),
			),
		}),
		db.query.importTemplates.findFirst({
			where: and(
				eq(importTemplates.id, templateId),
				eq(importTemplates.userId, userId),
			),
		}),
	]);
	if (!account || account.isArchived) throw new Error("Conta inválida");
	if (!template || template.isArchived)
		throw new Error("Modelo de importação inválido");

	const config = normalizeImportTemplateConfig(template.config);
	const parsedRows = parseImportCsv(await file.text(), config);
	const existingTransactions = await db
		.select({
			accountId: transactions.accountId,
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
		);
	const existingKeys = new Set(
		existingTransactions
			.filter(
				(row) =>
					row.movementType === "income" || row.movementType === "expense",
			)
			.map((row) =>
				duplicateKey({
					accountId: row.accountId,
					occurredOn: row.occurredOn,
					amountCents: row.amountCents,
					movementType: row.movementType as "income" | "expense",
					externalId: row.externalId,
					normalizedDescription: normalizeDescription(
						row.originalDescription ?? row.description,
					),
				}),
			),
	);
	const previousActiveBatches = await db
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
		);
	const previousActiveBatchIds = new Set(
		previousActiveBatches.map((batch) => batch.id),
	);
	const previousImportRows = await db
		.select({
			batchId: importRows.batchId,
			accountId: importRows.accountId,
			status: importRows.status,
			occurredOn: importRows.occurredOn,
			amountCents: importRows.amountCents,
			movementType: importRows.movementType,
			externalId: importRows.externalId,
			normalizedDescription: importRows.normalizedDescription,
		})
		.from(importRows)
		.where(
			and(eq(importRows.userId, userId), eq(importRows.accountId, accountId)),
		);
	const previousImportKeys = new Set(
		previousImportRows
			.filter(
				(row) =>
					previousActiveBatchIds.has(row.batchId) &&
					row.status !== "ignored" &&
					row.status !== "invalid" &&
					row.occurredOn &&
					row.amountCents &&
					(row.movementType === "income" || row.movementType === "expense"),
			)
			.map((row) =>
				duplicateKey({
					accountId: row.accountId,
					occurredOn: row.occurredOn ?? "",
					amountCents: row.amountCents ?? 0,
					movementType: row.movementType as "income" | "expense",
					externalId: row.externalId,
					normalizedDescription: row.normalizedDescription ?? "",
				}),
			),
	);
	const fileKeys = new Set<string>();
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

	let suggestionCount = 0;
	const suggestedRuleMatchCounts = new Map<number, number>();
	if (parsedRows.length > 0) {
		const rowValues: (typeof importRows.$inferInsert)[] = parsedRows.map(
			(row) => {
				let rowStatus: "invalid" | "duplicate" | "pending_review" =
					row.validationError ? "invalid" : "pending_review";
				let duplicateReason: string | null = null;
				if (row.occurredOn && row.amountCents && row.movementType) {
					const key = duplicateKey({
						accountId,
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
					rowStatus === "pending_review"
						? matchImportCategoryRule({ ...row, accountId }, rules)
						: null;
				if (suggestion) {
					suggestionCount++;
					suggestedRuleMatchCounts.set(
						suggestion.id,
						(suggestedRuleMatchCounts.get(suggestion.id) ?? 0) + 1,
					);
				}
				return {
					userId,
					batchId: batch.id,
					accountId,
					rowNumber: row.rowNumber,
					status: rowStatus,
					occurredOn: row.occurredOn,
					amountCents: row.amountCents,
					movementType: row.movementType,
					originalDescription: row.originalDescription,
					normalizedDescription: row.normalizedDescription,
					externalId: row.externalId,
					bankCategory: row.bankCategory,
					suggestedCategoryId: suggestion?.categoryId ?? null,
					suggestedRuleId: suggestion?.id ?? null,
					suggestedRecurrenceId: null,
					suggestedRecurrenceOccurrenceOn: null,
					suggestionSource: suggestion ? "rule" : null,
					validationError:
						[row.validationError, duplicateReason].filter(Boolean).join("; ") ||
						null,
					parsedData: row.parsedData,
				};
			},
		);
		const suggestedOccurrences = [...recurrenceContext.confirmedOccurrences];
		const rankedRecurrenceRows = rowValues
			.map((row, index) => {
				const amountCents = row.amountCents;
				const match =
					row.status === "pending_review" &&
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
								recurrenceContext.activeRecurrences,
								recurrenceContext.confirmedOccurrences,
								row.occurredOn,
							)
						: null;
				const occurrence = match
					? recurrenceContext.activeRecurrences.find(
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
							recurrenceContext.activeRecurrences,
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
	const [activeAccounts, activeCategories] = await Promise.all([
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
	]);
	const accountsById = new Map(
		activeAccounts.map((account) => [account.id, account]),
	);
	const categoriesById = new Map(
		activeCategories.map((category) => [category.id, category]),
	);
	const confirmCategoriesById = new Map<number, ImportConfirmCategory>(
		activeCategories.map((category) => [
			category.id,
			{ id: category.id, name: category.name, kind: category.kind },
		]),
	);
	const bulkCategoryId = optionalIntField(formData, "bulkCategoryId");

	// Pre-pass: surface category/kind issues per-row before opening the
	// transaction so the review screen can show inline errors instead of a
	// blanket digest crash.
	const rowErrors: Record<number, string> = {};
	for (const row of rows) {
		const decision = formData.get(`row-${row.id}-decision`)?.toString();
		if (decision !== "import") continue;
		const movementTypeValue = formData
			.get(`row-${row.id}-movementType`)
			?.toString();
		if (
			!movementTypeValue ||
			!importMovementTypes.has(movementTypeValue as "income" | "expense")
		)
			continue;
		const movementType = movementTypeValue as "income" | "expense";
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
		if (resolved.kind === "ok") continue;
		rowErrors[row.id] = formatConfirmCategoryError(resolved, movementType);
	}
	if (Object.keys(rowErrors).length > 0) {
		return {
			rowErrors,
			globalError: `Corrija ${Object.keys(rowErrors).length} linha(s) com categoria incompatível antes de confirmar.`,
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

			if (decision === "ignore") {
				if (row.suggestedCategoryId) {
					suggestionRejectedCount++;
					countRuleSuggestion(row.suggestedRuleId, "rejected");
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
				if (row.suggestedCategoryId) {
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
			const accountId = intField(
				formData,
				`row-${row.id}-accountId`,
				row.accountId,
			);
			if (!accountsById.has(accountId)) {
				throw new Error(`Conta inválida na linha ${row.rowNumber}`);
			}
			const rowCategoryId = optionalIntField(
				formData,
				`row-${row.id}-categoryId`,
			);
			const categoryId = rowCategoryId ?? bulkCategoryId;
			const category = categoryId ? categoriesById.get(categoryId) : null;
			if (!category)
				throw new Error(`Categoria obrigatória na linha ${row.rowNumber}`);
			const acceptedRuleId =
				row.suggestedCategoryId && category.id === row.suggestedCategoryId
					? row.suggestedRuleId
					: null;
			if (row.suggestedCategoryId) {
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
			if (category.kind !== movementType) {
				throw new Error(`Categoria incompatível na linha ${row.rowNumber}`);
			}
			const description = maskSensitive(
				formData.get(`row-${row.id}-description`)?.toString().trim() ||
					row.originalDescription ||
					row.normalizedDescription ||
					"Importação CSV",
			);
			if (formData.get(`row-${row.id}-createRule`) === "on") {
				rulesFromCorrections.push({
					userId,
					categoryId: category.id,
					accountId,
					movementType,
					description,
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
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
					accountId,
					occurredOn,
					amountCents,
					movementType,
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

	revalidatePath("/");
	revalidatePath("/import");
	revalidatePath("/assistente");
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

	revalidatePath("/");
	revalidatePath("/import");
}
