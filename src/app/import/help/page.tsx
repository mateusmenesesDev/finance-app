import Link from "next/link";
import { redirect } from "next/navigation";

import { FinanceShell, Panel } from "~/app/_components/finance-ui";
import { getSession } from "~/server/better-auth/server";

export default async function ImportHelpPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	return (
		<FinanceShell
			description="Guia genérico para preparar extratos CSV sem depender de telas específicas de bancos ou cartões."
			eyebrow="Ajuda CSV"
			title="Como exportar e preparar CSV"
		>
			<Panel title="Antes de exportar">
				<ul className="list-disc space-y-2 pl-5 text-[color:var(--color-text-muted)] text-sm">
					<li>Entre no app ou internet banking oficial do banco/cartão.</li>
					<li>Abra a área de extrato, lançamentos, movimentações ou fatura.</li>
					<li>
						Escolha um período fechado e evite misturar contas diferentes.
					</li>
					<li>
						Procure exportação em CSV, planilha ou arquivo separado por
						vírgula/ponto e vírgula.
					</li>
				</ul>
			</Panel>

			<Panel title="Formato esperado pelo Finance App">
				<div className="grid gap-4 text-[color:var(--color-text-muted)] text-sm">
					<p>
						O arquivo precisa ter cabeçalho e colunas estáveis para data,
						descrição e valor. O valor pode vir em uma coluna com sinal ou em
						duas colunas separadas para entrada e saída.
					</p>
					<pre className="overflow-x-auto rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg)] p-4 text-[color:var(--color-text)] text-xs">
						{`data;descricao;valor\n05/05/2026;Mercado Exemplo;-123,45\n06/05/2026;Salario;5000,00`}
					</pre>
					<p>
						Se o banco exportar categorias, IDs externos ou observações, salve
						os nomes dessas colunas no modelo de importação. Elas ajudam revisão
						e detecção de duplicidade, mas não substituem a conferência manual.
					</p>
				</div>
			</Panel>

			<Panel title="Cuidados de privacidade e revisão">
				<ul className="list-disc space-y-2 pl-5 text-[color:var(--color-text-muted)] text-sm">
					<li>
						Não exporte senhas, tokens, chaves ou dados que não sejam do
						extrato.
					</li>
					<li>
						O arquivo bruto não é armazenado; somente linhas parseadas e
						mascaradas ficam para revisão.
					</li>
					<li>
						Linhas inválidas mostram a causa e uma ação sugerida antes da
						confirmação.
					</li>
					<li>
						Revise duplicidades antes de confirmar para evitar saldo inflado.
					</li>
				</ul>
				<Link
					className="mt-4 inline-block rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm"
					href="/import"
				>
					Voltar para importação
				</Link>
			</Panel>
		</FinanceShell>
	);
}
