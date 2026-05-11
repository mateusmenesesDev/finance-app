// Exportação e exclusão dos dados financeiros de um usuário.
//
// O export é um JSON único, autocontido, refletindo o estado atual do banco
// (já mascarado pela política da Fase 12). A exclusão remove tudo do domínio
// finance_app_* mas preserva a conta de autenticação (Better Auth).

import { eq } from "drizzle-orm";

import { recordAudit } from "~/server/audit";
import { db } from "~/server/db";
import {
	assistantSuggestions,
	auditEvents,
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importRows,
	importTemplates,
	monthlyBudgets,
	recurrences,
	transactions,
} from "~/server/db/schema";

const exportSchemaVersion = "2026-05-12";

export type UserDataExport = {
	schemaVersion: string;
	exportedAt: string;
	userId: string;
	tables: {
		financialAccounts: unknown[];
		categoryGroups: unknown[];
		categories: unknown[];
		monthlyBudgets: unknown[];
		recurrences: unknown[];
		transactions: unknown[];
		importTemplates: unknown[];
		importBatches: unknown[];
		importRows: unknown[];
		importCategoryRules: unknown[];
		assistantSuggestions: unknown[];
		auditEvents: unknown[];
	};
};

export async function exportUserFinancialData(
	userId: string,
): Promise<UserDataExport> {
	const [
		accountsRows,
		groupsRows,
		categoriesRows,
		budgetsRows,
		recurrencesRows,
		transactionsRows,
		templatesRows,
		batchesRows,
		importRowsRows,
		categoryRulesRows,
		suggestionsRows,
		auditRows,
	] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId)),
		db.select().from(categoryGroups).where(eq(categoryGroups.userId, userId)),
		db.select().from(categories).where(eq(categories.userId, userId)),
		db.select().from(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
		db.select().from(recurrences).where(eq(recurrences.userId, userId)),
		db.select().from(transactions).where(eq(transactions.userId, userId)),
		db.select().from(importTemplates).where(eq(importTemplates.userId, userId)),
		db.select().from(importBatches).where(eq(importBatches.userId, userId)),
		db.select().from(importRows).where(eq(importRows.userId, userId)),
		db
			.select()
			.from(importCategoryRules)
			.where(eq(importCategoryRules.userId, userId)),
		db
			.select()
			.from(assistantSuggestions)
			.where(eq(assistantSuggestions.userId, userId)),
		db.select().from(auditEvents).where(eq(auditEvents.userId, userId)),
	]);

	return {
		schemaVersion: exportSchemaVersion,
		exportedAt: new Date().toISOString(),
		userId,
		tables: {
			financialAccounts: accountsRows,
			categoryGroups: groupsRows,
			categories: categoriesRows,
			monthlyBudgets: budgetsRows,
			recurrences: recurrencesRows,
			transactions: transactionsRows,
			importTemplates: templatesRows,
			importBatches: batchesRows,
			importRows: importRowsRows,
			importCategoryRules: categoryRulesRows,
			assistantSuggestions: suggestionsRows,
			auditEvents: auditRows,
		},
	};
}

export type DeleteAccountSummary = {
	accountId: number;
	accountName: string;
	transactionsArchived: number;
	transferLegsArchived: number;
};

// Hard-delete de uma conta arquivada e tudo que pertence a ela. Inclui as
// pernas das transferências mesmo que estejam ligadas a outras contas, para
// não deixar transações órfãs. As deleções são explícitas e ordenadas; o
// onDelete cascade no DB existe como rede de segurança contra rotas que
// venhamos a esquecer no futuro.
export async function deleteFinancialAccount(
	userId: string,
	accountId: number,
): Promise<DeleteAccountSummary> {
	return db.transaction(async (tx) => {
		const account = await tx.query.financialAccounts.findFirst({
			where: eq(financialAccounts.id, accountId),
		});
		if (!account || account.userId !== userId) {
			throw new Error("Conta não encontrada");
		}
		if (!account.isArchived) {
			throw new Error("Apenas contas arquivadas podem ser apagadas");
		}

		const ownTransactions = await tx
			.select({ id: transactions.id })
			.from(transactions)
			.where(eq(transactions.accountId, accountId));
		const transferLegs = await tx
			.select({ id: transactions.id })
			.from(transactions)
			.where(eq(transactions.destinationAccountId, accountId));

		const summary: DeleteAccountSummary = {
			accountId,
			accountName: account.name,
			transactionsArchived: ownTransactions.length,
			transferLegsArchived: transferLegs.length,
		};

		await recordAudit(tx, {
			userId,
			entityType: "financial_account",
			entityId: accountId,
			action: "deleted",
			summary: `Conta "${account.name}" e ${ownTransactions.length} transação(ões) apagadas (${transferLegs.length} pernas de transferência removidas)`,
			diff: summary,
		});

		await tx
			.delete(transactions)
			.where(eq(transactions.destinationAccountId, accountId));
		await tx.delete(transactions).where(eq(transactions.accountId, accountId));
		await tx.delete(importRows).where(eq(importRows.accountId, accountId));
		await tx
			.delete(importBatches)
			.where(eq(importBatches.accountId, accountId));
		await tx.delete(recurrences).where(eq(recurrences.accountId, accountId));
		await tx
			.delete(financialAccounts)
			.where(eq(financialAccounts.id, accountId));

		return summary;
	});
}

export type PurgeSummary = {
	deletedRows: Record<string, number>;
};

// Apaga todos os dados financeiros do usuário, mantendo a conta de
// autenticação intacta. Operações em ordem para respeitar foreign keys.
export async function purgeUserFinancialData(
	userId: string,
): Promise<PurgeSummary> {
	const summary: PurgeSummary = { deletedRows: {} };

	await db.transaction(async (tx) => {
		// Audit primeiro para deixar evidência do que está prestes a sumir.
		// Depois vamos apagar audit_events junto com o resto.
		await recordAudit(tx, {
			userId,
			entityType: "user_data",
			entityId: null,
			action: "purged",
			summary: "Limpeza completa dos dados financeiros do usuário",
		});

		const counts: Record<string, number> = {};
		const deleted = await tx
			.delete(transactions)
			.where(eq(transactions.userId, userId))
			.returning({ id: transactions.id });
		counts.transactions = deleted.length;

		const importRowsDeleted = await tx
			.delete(importRows)
			.where(eq(importRows.userId, userId))
			.returning({ id: importRows.id });
		counts.importRows = importRowsDeleted.length;

		const batchesDeleted = await tx
			.delete(importBatches)
			.where(eq(importBatches.userId, userId))
			.returning({ id: importBatches.id });
		counts.importBatches = batchesDeleted.length;

		const templatesDeleted = await tx
			.delete(importTemplates)
			.where(eq(importTemplates.userId, userId))
			.returning({ id: importTemplates.id });
		counts.importTemplates = templatesDeleted.length;

		const rulesDeleted = await tx
			.delete(importCategoryRules)
			.where(eq(importCategoryRules.userId, userId))
			.returning({ id: importCategoryRules.id });
		counts.importCategoryRules = rulesDeleted.length;

		const recurrencesDeleted = await tx
			.delete(recurrences)
			.where(eq(recurrences.userId, userId))
			.returning({ id: recurrences.id });
		counts.recurrences = recurrencesDeleted.length;

		const budgetsDeleted = await tx
			.delete(monthlyBudgets)
			.where(eq(monthlyBudgets.userId, userId))
			.returning({ id: monthlyBudgets.id });
		counts.monthlyBudgets = budgetsDeleted.length;

		const categoriesDeleted = await tx
			.delete(categories)
			.where(eq(categories.userId, userId))
			.returning({ id: categories.id });
		counts.categories = categoriesDeleted.length;

		const groupsDeleted = await tx
			.delete(categoryGroups)
			.where(eq(categoryGroups.userId, userId))
			.returning({ id: categoryGroups.id });
		counts.categoryGroups = groupsDeleted.length;

		const accountsDeleted = await tx
			.delete(financialAccounts)
			.where(eq(financialAccounts.userId, userId))
			.returning({ id: financialAccounts.id });
		counts.financialAccounts = accountsDeleted.length;

		const suggestionsDeleted = await tx
			.delete(assistantSuggestions)
			.where(eq(assistantSuggestions.userId, userId))
			.returning({ id: assistantSuggestions.id });
		counts.assistantSuggestions = suggestionsDeleted.length;

		const auditDeleted = await tx
			.delete(auditEvents)
			.where(eq(auditEvents.userId, userId))
			.returning({ id: auditEvents.id });
		counts.auditEvents = auditDeleted.length;

		summary.deletedRows = counts;
	});

	return summary;
}
