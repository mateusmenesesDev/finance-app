import Link from "next/link";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "~/app/esqueci-senha/forgot-password-form";
import { getSession } from "~/server/better-auth/server";

export const metadata = {
	title: "Esqueci minha senha · Finance App",
};

export default async function ForgotPasswordPage() {
	const session = await getSession();
	if (session) redirect("/");

	return (
		<main className="min-h-screen bg-[color:var(--color-bg)] px-6 py-10 text-[color:var(--color-text)]">
			<div className="mx-auto flex w-full max-w-md flex-col gap-8">
				<header className="border-[color:var(--color-border-subtle)] border-b pb-6">
					<p className="font-medium text-[color:var(--color-accent)] text-sm uppercase tracking-[0.3em]">
						Recuperar acesso
					</p>
					<h1 className="mt-3 font-semibold text-3xl tracking-tight">
						Esqueci minha senha
					</h1>
					<p className="mt-3 text-[color:var(--color-text-muted)]">
						Informe o email da sua conta. Se ele existir, enviaremos um link
						para redefinir a senha.
					</p>
				</header>

				<ForgotPasswordForm />

				<p className="text-[color:var(--color-text-muted)] text-sm">
					<Link
						className="underline-offset-4 hover:text-[color:var(--color-text)] hover:underline"
						href="/"
					>
						Voltar para entrar
					</Link>
				</p>
			</div>
		</main>
	);
}
