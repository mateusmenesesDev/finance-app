import { and, asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import {
	deleteAccountForever,
	purgeAllFinancialData,
} from "~/app/configuracoes/actions";
import { ActionDialog } from "~/components/action-dialog";
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
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { financialAccounts } from "~/server/db/schema";
import { userTag } from "~/server/invalidate";

const accountTypeLabels: Record<string, string> = {
	checking: "Conta corrente",
	savings: "Conta poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

function makeDadosLoader(userId: string) {
	return unstable_cache(
		async () => {
			const archivedAccounts = await db
				.select({
					id: financialAccounts.id,
					name: financialAccounts.name,
					type: financialAccounts.type,
				})
				.from(financialAccounts)
				.where(
					and(
						eq(financialAccounts.userId, userId),
						eq(financialAccounts.isArchived, true),
					),
				)
				.orderBy(asc(financialAccounts.name));
			return { archivedAccounts };
		},
		[`dados-data:${userId}`],
		{
			tags: [userTag(userId, "accounts")],
			revalidate: 3600,
		},
	);
}

export default async function DadosPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;
	const userEmail = session.user.email;

	const { archivedAccounts } = await makeDadosLoader(userId)();

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Exportar meus dados</CardTitle>
					<CardDescription>
						Baixa um JSON único com todas as tabelas financeiras: contas,
						categorias, transações, orçamentos, recorrências, importações,
						sugestões da IA e auditoria. Os valores refletem o estado atual do
						banco (já mascarado).
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild>
						<a
							download
							href="/api/configuracoes/export"
							rel="noopener"
							target="_blank"
						>
							Baixar JSON
						</a>
					</Button>
					<p className="mt-3 text-muted-foreground text-xs">
						CPFs, números de cartão e identificadores longos vêm ofuscados pela
						política de mascaramento. Senhas, tokens e credenciais bancárias não
						são exportados porque o app não os armazena.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Apagar uma conta arquivada</CardTitle>
					<CardDescription>
						Hard-delete de uma conta financeira arquivada. Apaga em cascata
						todas as transações, importações e recorrências dessa conta —
						incluindo as duas pernas de transferências envolvendo essa conta.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{archivedAccounts.length === 0 ? (
						<EmptyState title="Nenhuma conta arquivada. Arquive uma conta antes de apagá-la permanentemente." />
					) : (
						<ul className="flex flex-col gap-3">
							{archivedAccounts.map((account) => (
								<li
									className="rounded-md border bg-muted/20 p-4"
									key={account.id}
								>
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="font-medium text-sm">{account.name}</p>
											<p className="text-muted-foreground text-xs">
												{accountTypeLabels[account.type] ?? account.type}
											</p>
										</div>
										<ActionDialog
											action={deleteAccountForever}
											description="Esta ação é permanente e apaga todas as transações, importações e recorrências desta conta."
											formClassName="grid gap-3"
											pendingLabel="Apagando..."
											submitLabel="Apagar permanentemente"
											submitVariant="destructive"
											successMessage="Conta apagada permanentemente."
											title="Apagar permanentemente"
											trigger={
												<Button size="sm" variant="destructive">
													Apagar permanentemente
												</Button>
											}
										>
											<input
												name="accountId"
												type="hidden"
												value={account.id}
											/>
											<div className="grid gap-1">
												<Label htmlFor={`delete-account-email-${account.id}`}>
													Confirme digitando seu e-mail ({userEmail})
												</Label>
												<Input
													className="font-mono"
													id={`delete-account-email-${account.id}`}
													name="confirmEmail"
													required
													type="email"
												/>
											</div>
											<label className="flex items-center gap-2 text-muted-foreground text-xs">
												<input name="confirm" type="checkbox" />
												Entendo que esta ação é permanente e apaga todas as
												transações, importações e recorrências desta conta.
											</label>
										</ActionDialog>
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card className="border-destructive/40">
				<CardHeader>
					<CardTitle>Apagar todos os dados financeiros</CardTitle>
					<CardDescription>
						Limpa contas, categorias, transações, importações, regras,
						recorrências, sugestões e o histórico de auditoria. Mantém a sua
						conta de usuário e login intactos.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ActionDialog
						action={purgeAllFinancialData}
						description="Esta ação é permanente e remove todos os meus dados financeiros."
						formClassName="grid gap-3"
						pendingLabel="Apagando..."
						redirectTo="/configuracoes/privacidade"
						submitLabel="Apagar todos os dados financeiros"
						submitVariant="destructive"
						successMessage="Todos os dados financeiros foram apagados."
						title="Apagar todos os dados financeiros"
						trigger={
							<Button variant="destructive">
								Apagar todos os dados financeiros
							</Button>
						}
					>
						<div className="grid gap-1 text-xs">
							<Label htmlFor="purge-confirm-email">
								Confirme digitando seu e-mail ({userEmail})
							</Label>
							<Input
								className="font-mono"
								id="purge-confirm-email"
								name="confirmEmail"
								required
								type="email"
							/>
						</div>
						<div className="grid gap-1 text-xs">
							<Label htmlFor="purge-confirm-text">
								Digite{" "}
								<code className="rounded bg-muted px-1 py-0.5 font-mono text-destructive">
									APAGAR TUDO
								</code>{" "}
								para confirmar
							</Label>
							<Input
								className="font-mono"
								id="purge-confirm-text"
								name="confirmText"
								required
							/>
						</div>
						<label className="flex items-center gap-2 text-muted-foreground text-xs">
							<input name="confirm" type="checkbox" />
							Entendo que esta ação é permanente e remove todos os meus dados
							financeiros.
						</label>
					</ActionDialog>
				</CardContent>
			</Card>
		</div>
	);
}
