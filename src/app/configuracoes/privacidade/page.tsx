import { and, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import { runSanitizeHistory } from "~/app/configuracoes/actions";
import { EmptyState } from "~/components/empty-state";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatDateTime } from "~/lib/formatters";
import { sensitiveDataRules } from "~/lib/sensitive-data";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { auditEvents, importBatches } from "~/server/db/schema";
import { userTag } from "~/server/invalidate";

function makePrivacidadeLoader(userId: string) {
	return unstable_cache(
		async () => {
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
			return { lastSanitize, batchSummary };
		},
		[`privacidade-data:${userId}`],
		{
			tags: [userTag(userId, "privacy"), userTag(userId, "imports")],
			revalidate: 3600,
		},
	);
}

export default async function PrivacidadePage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;

	const { lastSanitize, batchSummary } = await makePrivacidadeLoader(userId)();

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Política de mascaramento</CardTitle>
					<CardDescription>
						Lista oficial de dados sigilosos. Aplicada na escrita de todo texto
						livre vindo do usuário e de CSV.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="grid gap-3 sm:grid-cols-2">
						{sensitiveDataRules.map((rule) => (
							<li className="rounded-md border bg-muted/20 p-4" key={rule.id}>
								<p className="font-semibold text-sm">{rule.label}</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{rule.description}
								</p>
								<dl className="mt-3 space-y-1 text-xs">
									<div className="flex gap-2">
										<dt className="w-16 shrink-0 text-muted-foreground">
											Entrada
										</dt>
										<dd className="font-mono text-muted-foreground">
											{rule.example.input}
										</dd>
									</div>
									<div className="flex gap-2">
										<dt className="w-16 shrink-0 text-muted-foreground">
											Saída
										</dt>
										<dd className="font-mono text-primary">
											{rule.example.output}
										</dd>
									</div>
								</dl>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Re-sanitizar histórico</CardTitle>
					<CardDescription>
						Aplica a política atual em transações, recorrências e lotes de
						importação já persistidos. Idempotente: rodar duas vezes não duplica
						alterações.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{lastSanitize ? (
					<p className="mb-3 text-muted-foreground text-sm">
						Última execução em {formatDateTime(new Date(lastSanitize.createdAt))} —{" "}
							{lastSanitize.summary}
						</p>
					) : (
						<p className="mb-3 text-muted-foreground text-sm">
							Nenhuma re-sanitização registrada para este usuário.
						</p>
					)}
					<form action={runSanitizeHistory}>
						<SubmitButton pendingLabel="Re-sanitizando...">
							Re-sanitizar histórico agora
						</SubmitButton>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Arquivos brutos importados</CardTitle>
					<CardDescription>
						Por padrão o app não armazena o CSV bruto. Cada lote indica
						explicitamente se manteve algum arquivo.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{batchSummary.length === 0 ? (
						<EmptyState title="Nenhum lote de importação encontrado." />
					) : (
						<div className="overflow-hidden rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Arquivo</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Quando</TableHead>
										<TableHead>Bruto armazenado</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{batchSummary.map((batch) => (
										<TableRow key={batch.id}>
											<TableCell className="font-mono text-xs">
												{batch.originalFileName}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{batch.status}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDateTime(new Date(batch.createdAt))}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														batch.rawFileStored ? "destructive" : "secondary"
													}
												>
													{batch.rawFileStored ? "Sim" : "Não"}
												</Badge>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
					<p className="mt-3 text-muted-foreground text-xs">
						O Finance App não persiste senhas ou credenciais bancárias e não
						armazena CSV bruto por padrão.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
