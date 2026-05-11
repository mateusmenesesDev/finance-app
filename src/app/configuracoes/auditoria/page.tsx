import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Panel } from "~/app/_components/finance-ui";
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

const pageSize = 100;

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

	return (
		<div className="flex flex-col gap-6">
			<Panel
				description={`Últimos ${pageSize} eventos relevantes (criação, edição, arquivamento, sanitização e limpeza).`}
				title="Histórico de auditoria"
			>
				<form
					action="/configuracoes/auditoria"
					className="mb-6 flex flex-wrap items-end gap-3"
				>
					<label className="flex flex-col gap-1 text-slate-300 text-xs">
						Entidade
						<select
							className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 text-sm"
							defaultValue={entityTypeFilter ?? ""}
							name="entityType"
						>
							{entityTypeOptions.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-slate-300 text-xs">
						Ação
						<select
							className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 text-sm"
							defaultValue={actionFilter ?? ""}
							name="action"
						>
							{actionOptions.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-1 text-slate-300 text-xs">
						ID da entidade
						<input
							className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 text-sm"
							defaultValue={params.entityId ?? ""}
							inputMode="numeric"
							name="entityId"
							placeholder="opcional"
						/>
					</label>
					<button
						className="rounded-xl border border-slate-700 px-4 py-2 font-medium text-slate-100 text-sm hover:border-slate-500"
						type="submit"
					>
						Filtrar
					</button>
					<Link
						className="rounded-xl border border-slate-800 px-4 py-2 font-medium text-slate-300 text-sm hover:border-slate-600"
						href="/configuracoes/auditoria"
					>
						Limpar
					</Link>
				</form>

				{events.length === 0 ? (
					<p className="text-slate-400 text-sm">
						Nenhum evento encontrado para os filtros aplicados.
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{events.map((event) => (
							<li
								className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
								key={event.id}
							>
								<div className="flex flex-wrap items-center justify-between gap-2 text-slate-400 text-xs">
									<span>
										{entityTypeLabels[event.entityType] ?? event.entityType} ·{" "}
										{actionLabels[event.action] ?? event.action}
									</span>
									<span>{formatDateTime(event.createdAt)}</span>
								</div>
								<p className="mt-2 text-slate-100 text-sm">{event.summary}</p>
								{event.entityId !== null ? (
									<p className="text-slate-500 text-xs">ID #{event.entityId}</p>
								) : null}
								{event.diff ? (
									<details className="mt-2">
										<summary className="cursor-pointer text-emerald-300 text-xs">
											Ver detalhes
										</summary>
										<pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-3 font-mono text-slate-200 text-xs">
											{JSON.stringify(event.diff, null, 2)}
										</pre>
									</details>
								) : null}
							</li>
						))}
					</ul>
				)}
			</Panel>
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
