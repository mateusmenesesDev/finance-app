import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Panel, SubmitButton } from "~/app/_components/finance-ui";
import { runSanitizeHistory } from "~/app/configuracoes/actions";
import { formatDateTime } from "~/lib/formatters";
import { sensitiveDataRules } from "~/lib/sensitive-data";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { auditEvents, importBatches } from "~/server/db/schema";

export default async function PrivacidadePage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;

	const [lastSanitize, batchSummary] = await Promise.all([
		db.query.auditEvents.findFirst({
			where: and(
				eq(auditEvents.userId, userId),
				eq(auditEvents.action, "sanitized"),
			),
			orderBy: desc(auditEvents.createdAt),
		}),
		db
			.select({
				id: importBatches.id,
				originalFileName: importBatches.originalFileName,
				rawFileStored: importBatches.rawFileStored,
				createdAt: importBatches.createdAt,
				status: importBatches.status,
			})
			.from(importBatches)
			.where(eq(importBatches.userId, userId))
			.orderBy(desc(importBatches.createdAt))
			.limit(20),
	]);

	return (
		<div className="flex flex-col gap-6">
			<Panel
				description="Lista oficial de dados sigilosos. Aplicada na escrita de todo texto livre vindo do usuário e de CSV."
				title="Política de mascaramento"
			>
				<ul className="grid gap-3 sm:grid-cols-2">
					{sensitiveDataRules.map((rule) => (
						<li
							className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
							key={rule.id}
						>
							<p className="font-semibold text-[color:var(--color-text)] text-sm">
								{rule.label}
							</p>
							<p className="mt-1 text-[color:var(--color-text-muted)] text-xs">
								{rule.description}
							</p>
							<dl className="mt-3 space-y-1 text-xs">
								<div className="flex gap-2">
									<dt className="w-16 shrink-0 text-[color:var(--color-text-subtle)]">
										Entrada
									</dt>
									<dd className="font-mono text-[color:var(--color-text-muted)]">
										{rule.example.input}
									</dd>
								</div>
								<div className="flex gap-2">
									<dt className="w-16 shrink-0 text-[color:var(--color-text-subtle)]">
										Saída
									</dt>
									<dd className="font-mono text-[color:var(--color-accent)]">
										{rule.example.output}
									</dd>
								</div>
							</dl>
						</li>
					))}
				</ul>
			</Panel>

			<Panel
				description="Aplica a política atual em transações, recorrências e lotes de importação já persistidos. Idempotente: rodar duas vezes não duplica alterações."
				title="Re-sanitizar histórico"
			>
				{lastSanitize ? (
					<p className="mb-3 text-[color:var(--color-text-muted)] text-sm">
						Última execução em {formatDateTime(lastSanitize.createdAt)} —{" "}
						{lastSanitize.summary}
					</p>
				) : (
					<p className="mb-3 text-[color:var(--color-text-muted)] text-sm">
						Nenhuma re-sanitização registrada para este usuário.
					</p>
				)}
				<form action={runSanitizeHistory}>
					<SubmitButton>Re-sanitizar histórico agora</SubmitButton>
				</form>
			</Panel>

			<Panel
				description="Por padrão o app não armazena o CSV bruto. Cada lote indica explicitamente se manteve algum arquivo."
				title="Arquivos brutos importados"
			>
				{batchSummary.length === 0 ? (
					<p className="text-[color:var(--color-text-muted)] text-sm">
						Nenhum lote de importação encontrado.
					</p>
				) : (
					<table className="w-full text-left text-sm">
						<thead className="text-[color:var(--color-text-muted)] text-xs uppercase">
							<tr>
								<th className="py-2">Arquivo</th>
								<th className="py-2">Status</th>
								<th className="py-2">Quando</th>
								<th className="py-2">Bruto armazenado</th>
							</tr>
						</thead>
						<tbody>
							{batchSummary.map((batch) => (
								<tr
									className="border-[color:var(--color-border-subtle)] border-t"
									key={batch.id}
								>
									<td className="py-2 font-mono text-[color:var(--color-text)] text-xs">
										{batch.originalFileName}
									</td>
									<td className="py-2 text-[color:var(--color-text-muted)]">
										{batch.status}
									</td>
									<td className="py-2 text-[color:var(--color-text-muted)]">
										{formatDateTime(batch.createdAt)}
									</td>
									<td className="py-2 text-[color:var(--color-text-muted)]">
										{batch.rawFileStored ? "Sim" : "Não"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				<p className="mt-3 text-[color:var(--color-text-subtle)] text-xs">
					O Finance App não persiste senhas ou credenciais bancárias e não
					armazena CSV bruto por padrão.
				</p>
			</Panel>
		</div>
	);
}
