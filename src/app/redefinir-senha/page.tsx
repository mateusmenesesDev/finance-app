import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "~/app/redefinir-senha/reset-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
		<main className="min-h-screen bg-background px-6 py-10 text-foreground">
			<div className="mx-auto flex w-full max-w-md flex-col gap-8">
				<header className="border-b pb-6">
					<p className="font-medium text-primary text-sm uppercase tracking-[0.3em]">
						Recuperar acesso
					</p>
					<h1 className="mt-3 font-semibold text-3xl tracking-tight">
						Redefinir senha
					</h1>
					<p className="mt-3 text-muted-foreground">
						Escolha uma nova senha para sua conta. Todas as outras sessões serão
						encerradas após a troca.
					</p>
				</header>

				{token && !linkError ? (
					<ResetPasswordForm token={token} />
				) : (
					<InvalidTokenPanel reason={linkError} />
				)}
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
		<Card className="border-destructive/40 bg-destructive/5">
			<CardHeader>
				<CardTitle className="text-destructive">{message}</CardTitle>
			</CardHeader>
			<CardContent>
				<Link
					className="font-medium text-destructive underline-offset-4 hover:underline"
					href="/esqueci-senha"
				>
					Pedir novo link
				</Link>
			</CardContent>
		</Card>
	);
}
