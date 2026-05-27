// Auditoria fina para ações relevantes do usuário. O contrato é mínimo de
// propósito: cada chamada cria uma linha em finance_app_audit_events.
//
// Por que existir: rastrear alterações que mudam números/relatórios sem
// poluir o domínio com colunas de "lastEditedBy". Diff é JSON livre porque
// linhas são auditadas e não consultadas analiticamente.

import type { db as DbType } from "~/server/db";
import { auditEvents } from "~/server/db/schema";

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];
export type AuditDb = typeof DbType | Tx;

export type AuditAction =
	| "created"
	| "updated"
	| "archived"
	| "restored"
	| "deleted"
	| "sanitized"
	| "purged";

export type AuditEntityType =
	| "transaction"
	| "financial_account"
	| "import_batch"
	| "assistant_suggestion"
	| "user_data";

export type AuditFieldChange = {
	field: string;
	from: unknown;
	to: unknown;
};

// Campos cujo valor mudando merece linha em audit_events.
// Mantenha enxuto: descrições/notas mudam muito e poluem o log.
const transactionAuditFields = [
	"accountId",
	"destinationAccountId",
	"categoryId",
	"movementType",
	"status",
	"amountCents",
	"occurredOn",
	"isArchived",
] as const;

export type TransactionAuditSnapshot = Pick<
	{
		accountId: number | null;
		destinationAccountId: number | null;
		categoryId: number | null;
		movementType: string;
		status: string;
		amountCents: number;
		occurredOn: string;
		isArchived: boolean;
	},
	(typeof transactionAuditFields)[number]
>;

export function diffTransaction(
	before: TransactionAuditSnapshot | null,
	after: TransactionAuditSnapshot | null,
): AuditFieldChange[] {
	if (!before || !after) return [];
	const changes: AuditFieldChange[] = [];
	for (const field of transactionAuditFields) {
		if (before[field] !== after[field]) {
			changes.push({ field, from: before[field], to: after[field] });
		}
	}
	return changes;
}

export async function recordAudit(
	tx: AuditDb,
	args: {
		userId: string;
		entityType: AuditEntityType;
		entityId: number | null;
		action: AuditAction;
		summary: string;
		diff?: AuditFieldChange[] | Record<string, unknown> | null;
	},
) {
	const summary = args.summary.slice(0, 240);
	await tx.insert(auditEvents).values({
		userId: args.userId,
		entityType: args.entityType,
		entityId: args.entityId,
		action: args.action,
		summary,
		diff: args.diff ?? null,
	});
}
