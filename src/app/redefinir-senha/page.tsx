import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "~/app/redefinir-senha/reset-password-form";
import { getSession } from "~/server/better-auth/server";

export const metadata = {
	title: "Redefinir senha · Finance App",
};

type ResetPasswordPageProps = {
	searchParams?: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({
	searchParams,
}: ResetPasswordPageProps) {
	const session = await getSession();
	if (session) redirect("/");

	const params = (await searchParams) ?? {};
	const token = typeof params.token === "string" ? params.token : "";
	const linkError = typeof params.error === "string" ? params.error : "";

	return (
		<main className="min-h-screen bg-[color:var(--color-bg)] px-6 py-10 text-[color:var(--color-text)]">
			<div className="mx-auto flex w-full max-w-md flex-col gap-8">
				<header className="border-[color:var(--color-border-subtle)] border-b pb-6">
					<p className="font-medium text-[color:var(--color-accent)] text-sm uppercase tracking-[0.3em]">
						Recuperar acesso
					</p>
					<h1 className="mt-3 font-semibold text-3xl tracking-tight">
						Redefinir senha
					</h1>
					<p className="mt-3 text-[color:var(--color-text-muted)]">
						Escolha uma nova senha para sua conta. Todas as outras sessões serão
						encerradas após a troca.
					</p>
				</header>

				{token && !linkError ? (
					<ResetPasswordForm token={token} />
				) : (
					<InvalidTokenPanel reason={linkError} />
				)}

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

function InvalidTokenPanel({ reason }: { reason: string }) {
	const message =
		reason === "invalid_token" || reason === "INVALID_TOKEN"
			? "Este link de redefinição é inválido ou já foi usado."
			: reason === "expired" || reason === "EXPIRED_TOKEN"
				? "Este link de redefinição expirou. Peça um novo."
				: "Link de redefinição inválido. Peça um novo para continuar.";

	return (
		<div className="rounded-3xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-6 text-[color:var(--color-bad)] shadow-2xl shadow-black/10">
			<p className="font-medium">{message}</p>
			<Link
				className="mt-4 inline-block font-medium text-[color:var(--color-bad)] underline-offset-4 hover:underline"
				href="/esqueci-senha"
			>
				Pedir novo link
			</Link>
		</div>
	);
}
