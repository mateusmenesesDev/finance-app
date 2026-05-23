import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getSession } from "~/server/better-auth/server";

export default async function ImportHelpPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Guia genérico para preparar extratos CSV sem depender de telas específicas de bancos ou cartões."
				eyebrow="Ajuda CSV"
				title="Como exportar e preparar CSV"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Antes de exportar</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
						<li>Entre no app ou internet banking oficial do banco/cartão.</li>
						<li>
							Abra a área de extrato, lançamentos, movimentações ou fatura.
						</li>
						<li>
							Escolha um período fechado e evite misturar contas diferentes.
						</li>
						<li>
							Procure exportação em CSV, planilha ou arquivo separado por
							vírgula/ponto e vírgula.
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Formato esperado pelo Finance App</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 text-muted-foreground text-sm">
						<p>
							O arquivo precisa ter cabeçalho e colunas estáveis para data,
							descrição e valor. O valor pode vir em uma coluna com sinal ou em
							duas colunas separadas para entrada e saída.
						</p>
						<pre className="overflow-x-auto rounded-md border bg-background p-4 text-foreground text-xs">
							{`data;descricao;valor\n05/05/2026;Mercado Exemplo;-123,45\n06/05/2026;Salario;5000,00`}
						</pre>
						<p>
							Se o banco exportar categorias, IDs externos ou observações, salve
							os nomes dessas colunas no modelo de importação. Elas ajudam
							revisão e detecção de duplicidade, mas não substituem a
							conferência manual.
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Cuidados de privacidade e revisão</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
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
					<Button asChild className="mt-4" variant="outline">
						<Link href="/import">Voltar para importação</Link>
					</Button>
				</CardContent>
			</Card>
		</AppShell>
	);
}
