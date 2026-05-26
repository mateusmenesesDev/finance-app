import { SignInForm } from "~/app/_components/sign-in-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

export const metadata = {
	title: "Entrar · Finance App",
};

export default function EntrarPage() {
	return (
		<main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
				<header className="border-b pb-8">
					<p className="font-medium text-primary text-sm uppercase tracking-wider">
						Finanças pessoais
					</p>
					<h1 className="mt-3 font-semibold text-4xl tracking-tight">
						Finance App
					</h1>
					<p className="mt-3 max-w-2xl text-muted-foreground">
						Controle contas, categorias, transações e faturas em BRL.
					</p>
				</header>
				<section className="grid gap-8 md:grid-cols-[1fr_420px] md:items-start">
					<Card>
						<CardHeader>
							<CardTitle className="text-2xl">
								Base simples para controle financeiro
							</CardTitle>
							<CardDescription>
								Entre com email e senha para acessar seu painel financeiro
								isolado por usuário.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-2 text-muted-foreground text-sm">
							<p>• Compras no cartão são despesas.</p>
							<p>• Pagamento de fatura é transferência para o cartão.</p>
							<p>• Transações arquivadas não entram nos saldos padrão.</p>
						</CardContent>
					</Card>
					<SignInForm />
				</section>
			</div>
		</main>
	);
}
