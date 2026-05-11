import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Panel } from "~/app/_components/finance-ui";
import {
	deleteAccountForever,
	purgeAllFinancialData,
} from "~/app/configuracoes/actions";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { financialAccounts } from "~/server/db/schema";

const accountTypeLabels: Record<string, string> = {
	checking: "Conta corrente",
	savings: "Conta poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

export default async function DadosPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;
	const userEmail = session.user.email;

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

	return (
		<div className="flex flex-col gap-6">
			<Panel
				description="Baixa um JSON único com todas as tabelas financeiras: contas, categorias, transações, orçamentos, recorrências, importações, sugestões da IA e auditoria. Os valores refletem o estado atual do banco (já mascarado)."
				title="Exportar meus dados"
			>
				<a
					className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 font-medium text-slate-950 text-sm"
					download
					href="/api/configuracoes/export"
					rel="noopener"
					target="_blank"
				>
					Baixar JSON
				</a>
				<p className="mt-3 text-slate-500 text-xs">
					CPFs, números de cartão e identificadores longos vêm ofuscados pela
					política de mascaramento. Senhas, tokens e credenciais bancárias não
					são exportados porque o app não os armazena.
				</p>
			</Panel>

			<Panel
				description="Hard-delete de uma conta financeira arquivada. Apaga em cascata todas as transações, importações e recorrências dessa conta — incluindo as duas pernas de transferências envolvendo essa conta."
				title="Apagar uma conta arquivada"
			>
				{archivedAccounts.length === 0 ? (
					<p className="text-slate-400 text-sm">
						Nenhuma conta arquivada. Arquive uma conta antes de apagá-la
						permanentemente.
					</p>
				) : (
					<ul className="flex flex-col gap-3">
						{archivedAccounts.map((account) => (
							<li
								className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
								key={account.id}
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="font-medium text-slate-100 text-sm">
											{account.name}
										</p>
										<p className="text-slate-500 text-xs">
											{accountTypeLabels[account.type] ?? account.type}
										</p>
									</div>
								</div>
								<form
									action={deleteAccountForever}
									className="mt-3 flex flex-col gap-2 text-slate-300 text-xs"
								>
									<input name="accountId" type="hidden" value={account.id} />
									<label className="flex flex-col gap-1">
										Confirme digitando seu e-mail ({userEmail})
										<input
											className="rounded-xl border border-rose-700/60 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm"
											name="confirmEmail"
											required
											type="email"
										/>
									</label>
									<label className="flex items-center gap-2">
										<input name="confirm" type="checkbox" />
										Entendo que esta ação é permanente e apaga todas as
										transações, importações e recorrências desta conta.
									</label>
									<button
										className="self-start rounded-xl bg-rose-500 px-4 py-2 font-medium text-slate-950 text-sm"
										type="submit"
									>
										Apagar permanentemente
									</button>
								</form>
							</li>
						))}
					</ul>
				)}
			</Panel>

			<Panel
				description="Limpa contas, categorias, transações, importações, regras, recorrências, sugestões e o histórico de auditoria. Mantém a sua conta de usuário e login intactos."
				title="Apagar todos os dados financeiros"
			>
				<form
					action={purgeAllFinancialData}
					className="flex flex-col gap-3 text-slate-300 text-sm"
				>
					<label className="flex flex-col gap-1 text-xs">
						Confirme digitando seu e-mail ({userEmail})
						<input
							className="rounded-xl border border-rose-700/60 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm"
							name="confirmEmail"
							required
							type="email"
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs">
						Digite{" "}
						<code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-rose-300">
							APAGAR TUDO
						</code>{" "}
						para confirmar
						<input
							className="rounded-xl border border-rose-700/60 bg-slate-950 px-3 py-2 font-mono text-slate-100 text-sm"
							name="confirmText"
							required
						/>
					</label>
					<label className="flex items-center gap-2 text-xs">
						<input name="confirm" type="checkbox" />
						Entendo que esta ação é permanente e remove todos os meus dados
						financeiros.
					</label>
					<button
						className="self-start rounded-xl bg-rose-500 px-4 py-2 font-medium text-slate-950 text-sm"
						type="submit"
					>
						Apagar todos os dados financeiros
					</button>
				</form>
			</Panel>
		</div>
	);
}
