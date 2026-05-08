"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
	defaultTemplateConfig,
	duplicateKey,
	type ImportTemplateConfig,
	normalizeDescription,
	normalizeImportTemplateConfig,
	parseImportCsv,
} from "~/lib/import-rules";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importRows,
	importTemplates,
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
const importMovementTypes = new Set<"income" | "expense">([
	"income",
	"expense",
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

function moneyToCents(value: string, { allowZero }: { allowZero: boolean }) {
	const normalized = value.replace(/\./g, "").replace(",", ".");
	const amount = Number.parseFloat(normalized);
	if (!Number.isFinite(amount) || amount < 0) throw new Error("Valor inválido");
	if (!allowZero && amount === 0)
		throw new Error("Valor deve ser maior que zero");
	return Math.round(amount * 100);
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
	await db
		.update(financialAccounts)
		.set({ isArchived: true, isActive: false })
		.where(
			and(
				eq(financialAccounts.id, intField(formData, "id")),
				eq(financialAccounts.userId, userId),
			),
		);
	revalidatePath("/");
}

export async function createDefaultCategories() {
	const userId = await requireUserId();
	for (const group of defaultGroups) {
		let [savedGroup] = await db
			.select()
			.from(categoryGroups)
			.where(
				and(
					eq(categoryGroups.userId, userId),
					eq(categoryGroups.kind, group.kind),
					eq(categoryGroups.name, group.name),
				),
			);
		if (!savedGroup) {
			[savedGroup] = await db
				.insert(categoryGroups)
				.values({ userId, name: group.name, kind: group.kind })
				.returning();
		}
		if (!savedGroup) throw new Error("Não foi possível criar grupo padrão");
		for (const categoryName of group.categories) {
			const [existing] = await db
				.select({ id: categories.id })
				.from(categories)
				.where(
					and(
						eq(categories.userId, userId),
						eq(categories.groupId, savedGroup.id),
						eq(categories.name, categoryName),
					),
				);
			if (!existing) {
				await db.insert(categories).values({
					userId,
					groupId: savedGroup.id,
					kind: group.kind,
					name: categoryName,
				});
			}
		}
	}
	revalidatePath("/");
}

export async function createCategoryGroup(formData: FormData) {
	const userId = await requireUserId();
	await db.insert(categoryGroups).values({
		userId,
		name: requiredString(formData, "name"),
		kind: enumField(formData, "kind", categoryKinds),
	});
	revalidatePath("/");
}

export async function updateCategoryGroup(formData: FormData) {
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

export async function createCategory(formData: FormData) {
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
}

export async function updateCategory(formData: FormData) {
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

	return {
		userId,
		accountId,
		destinationAccountId,
		categoryId,
		movementType,
		status: enumField(formData, "status", transactionStatuses),
		amountCents: moneyToCents(requiredString(formData, "amount"), {
			allowZero: false,
		}),
		occurredOn: requiredString(formData, "occurredOn"),
		originalDescription: optionalString(formData, "originalDescription"),
		description: requiredString(formData, "description"),
		notes: optionalString(formData, "notes"),
	};
}

export async function createTransaction(formData: FormData) {
	const userId = await requireUserId();
	await db
		.insert(transactions)
		.values(await transactionValues(userId, formData));
	revalidatePath("/");
}

export async function updateTransaction(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(transactions)
		.set(await transactionValues(userId, formData))
		.where(
			and(
				eq(transactions.id, intField(formData, "id")),
				eq(transactions.userId, userId),
			),
		);
	revalidatePath("/");
}

export async function archiveTransaction(formData: FormData) {
	const userId = await requireUserId();
	await db
		.update(transactions)
		.set({ isArchived: true })
		.where(
			and(
				eq(transactions.id, intField(formData, "id")),
				eq(transactions.userId, userId),
			),
		);
	revalidatePath("/");
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
		sourceLabel: optionalString(formData, "sourceLabel"),
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
			sourceLabel: optionalString(formData, "sourceLabel"),
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

	const [batch] = await db
		.insert(importBatches)
		.values({
			userId,
			importTemplateId: template.id,
			accountId,
			status: "reviewing",
			originalFileName: file.name.slice(0, 255),
			sourceLabel: template.sourceLabel,
			rowCount: parsedRows.length,
			rawFileStored: false,
		})
		.returning();
	if (!batch) throw new Error("Não foi possível criar importação");

	if (parsedRows.length > 0) {
		await db.insert(importRows).values(
			parsedRows.map((row) => {
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
					validationError:
						[row.validationError, duplicateReason].filter(Boolean).join("; ") ||
						null,
					parsedData: row.parsedData,
				};
			}),
		);
	}

	revalidatePath("/import");
	redirect(`/import?batchId=${batch.id}`);
}

export async function confirmImportBatch(formData: FormData) {
	const userId = await requireUserId();
	const batchId = intField(formData, "batchId");
	const batch = await db.query.importBatches.findFirst({
		where: and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
	});
	if (!batch || batch.status !== "reviewing")
		throw new Error("Importação inválida");

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
	const bulkCategoryId = optionalIntField(formData, "bulkCategoryId");

	await db.transaction(async (tx) => {
		for (const row of rows) {
			const decision = formData.get(`row-${row.id}-decision`)?.toString();
			if (!decision)
				throw new Error(`Decisão obrigatória na linha ${row.rowNumber}`);

			if (decision === "ignore") {
				await tx
					.update(importRows)
					.set({ status: "ignored" })
					.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
				continue;
			}
			if (decision === "duplicate") {
				await tx
					.update(importRows)
					.set({ status: "duplicate" })
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
			if (category.kind !== movementType) {
				throw new Error(`Categoria incompatível na linha ${row.rowNumber}`);
			}
			const description =
				formData.get(`row-${row.id}-description`)?.toString().trim() ||
				row.originalDescription ||
				row.normalizedDescription ||
				"Importação CSV";

			await tx.insert(transactions).values({
				userId,
				accountId,
				categoryId,
				importBatchId: batch.id,
				importRowId: row.id,
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
				})
				.where(and(eq(importRows.id, row.id), eq(importRows.userId, userId)));
		}
		await tx
			.update(importBatches)
			.set({ status: "confirmed", confirmedAt: new Date() })
			.where(
				and(eq(importBatches.id, batch.id), eq(importBatches.userId, userId)),
			);
	});

	revalidatePath("/");
	revalidatePath("/import");
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
			.set({ status: "ignored" })
			.where(
				and(eq(importRows.batchId, batchId), eq(importRows.userId, userId)),
			);
		await tx
			.update(importBatches)
			.set({ status: "cancelled" })
			.where(
				and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
			);
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
		await tx
			.update(transactions)
			.set({ isArchived: true })
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.importBatchId, batchId),
				),
			);
		await tx
			.update(importBatches)
			.set({ status: "reverted" })
			.where(
				and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
			);
	});

	revalidatePath("/");
	revalidatePath("/import");
}
