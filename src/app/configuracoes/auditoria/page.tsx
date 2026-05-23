import type { ColumnDef } from "@tanstack/react-table";
import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "~/components/data-table";
import { EmptyState } from "~/components/empty-state";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatDateTime } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	type auditAction as AuditActionEnum,
	type auditEntityType as AuditEntityTypeEnum,
	auditEvents,
} from "~/server/db/schema";

const entityTypeLabels: Record<string, string> = {
	transaction: "Transação",
	financial_account: "Conta",
	import_batch: "Lote de importação",
	assistant_suggestion: "Sugestão da IA",
	user_data: "Dados do usuário",
};

const actionLabels: Record<string, string> = {
	created: "Criada",
	updated: "Atualizada",
	archived: "Arquivada",
	restored: "Restaurada",
	deleted: "Excluída",
	sanitized: "Sanitização",
	purged: "Limpeza completa",
};

const entityTypeOptions = [
	{ value: "", label: "Todos os tipos" },
	{ value: "transaction", label: "Transações" },
	{ value: "financial_account", label: "Contas" },
	{ value: "import_batch", label: "Importações" },
	{ value: "assistant_suggestion", label: "Sugestões da IA" },
	{ value: "user_data", label: "Dados do usuário" },
];

const actionOptions = [
	{ value: "", label: "Todas as ações" },
	{ value: "created", label: "Criada" },
	{ value: "updated", label: "Atualizada" },
	{ value: "archived", label: "Arquivada" },
	{ value: "restored", label: "Restaurada" },
	{ value: "deleted", label: "Excluída" },
	{ value: "sanitized", label: "Sanitização" },
	{ value: "purged", label: "Limpeza completa" },
];

type AuditPageProps = {
	searchParams?: Promise<{
		entityType?: string;
		action?: string;
		entityId?: string;
	}>;
};

type AuditTableRow = {
	id: number;
	entity: string;
	action: string;
	when: string;
	summary: string;
	entityId: string;
	diff: string;
};

const pageSize = 100;
const auditColumns: ColumnDef<AuditTableRow, unknown>[] = [
	{ accessorKey: "entity", header: "Entidade" },
	{ accessorKey: "action", header: "Ação" },
	{ accessorKey: "when", header: "Quando" },
	{ accessorKey: "summary", header: "Resumo" },
	{ accessorKey: "entityId", header: "ID" },
	{ accessorKey: "diff", header: "Detalhes" },
];

export default async function AuditoriaPage({ searchParams }: AuditPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;
	const params = (await searchParams) ?? {};
	const entityTypeFilter = pickEnum(
		params.entityType,
		entityTypeOptions.map((opt) => opt.value),
	);
	const actionFilter = pickEnum(
		params.action,
		actionOptions.map((opt) => opt.value),
	);
	const entityIdFilter = parseEntityId(params.entityId);

	const filters: SQL[] = [eq(auditEvents.userId, userId)];
	if (entityTypeFilter) {
		filters.push(
			eq(
				auditEvents.entityType,
				entityTypeFilter as (typeof AuditEntityTypeEnum)["enumValues"][number],
			),
		);
	}
	if (actionFilter) {
		filters.push(
			eq(
				auditEvents.action,
				actionFilter as (typeof AuditActionEnum)["enumValues"][number],
			),
		);
	}
	if (entityIdFilter !== null) {
		filters.push(eq(auditEvents.entityId, entityIdFilter));
	}

	const events = await db
		.select()
		.from(auditEvents)
		.where(and(...filters))
		.orderBy(desc(auditEvents.createdAt))
		.limit(pageSize);
	const rows = events.map((event) => ({
		id: event.id,
		entity: entityTypeLabels[event.entityType] ?? event.entityType,
		action: actionLabels[event.action] ?? event.action,
		when: formatDateTime(event.createdAt),
		summary: event.summary,
		entityId: event.entityId === null ? "—" : `#${event.entityId}`,
		diff: event.diff ? JSON.stringify(event.diff) : "—",
	}));

	return (
		<Card>
			<CardHeader>
				<CardTitle>Histórico de auditoria</CardTitle>
				<CardDescription>{`Últimos ${pageSize} eventos relevantes (criação, edição, arquivamento, sanitização e limpeza).`}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					action="/configuracoes/auditoria"
					className="mb-6 flex flex-wrap items-end gap-3"
				>
					<FilterSelect
						defaultValue={entityTypeFilter ?? ""}
						label="Entidade"
						name="entityType"
						options={entityTypeOptions}
					/>
					<FilterSelect
						defaultValue={actionFilter ?? ""}
						label="Ação"
						name="action"
						options={actionOptions}
					/>
					<div className="grid gap-1">
						<Label className="text-xs" htmlFor="entityId">
							ID da entidade
						</Label>
						<Input
							defaultValue={params.entityId ?? ""}
							id="entityId"
							inputMode="numeric"
							name="entityId"
							placeholder="opcional"
						/>
					</div>
					<Button type="submit" variant="outline">
						Filtrar
					</Button>
					<Button asChild variant="ghost">
						<Link href="/configuracoes/auditoria">Limpar</Link>
					</Button>
				</form>
				{rows.length === 0 ? (
					<EmptyState title="Nenhum evento encontrado para os filtros aplicados." />
				) : (
					<DataTable
						columns={auditColumns}
						data={rows}
						density="compact"
						emptyMessage="Nenhum evento encontrado."
						searchColumn="summary"
						searchPlaceholder="Filtrar resumo..."
					/>
				)}
			</CardContent>
		</Card>
	);
}

function FilterSelect({
	label,
	name,
	options,
	defaultValue,
}: {
	label: string;
	name: string;
	options: { value: string; label: string }[];
	defaultValue: string;
}) {
	return (
		<div className="grid gap-1">
			<Label className="text-xs" htmlFor={name}>
				{label}
			</Label>
			<select
				className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
				defaultValue={defaultValue}
				id={name}
				name={name}
			>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}

function pickEnum(value: string | undefined, allowed: string[]) {
	if (!value) return null;
	return allowed.includes(value) && value !== "" ? value : null;
}

function parseEntityId(value: string | undefined) {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}
