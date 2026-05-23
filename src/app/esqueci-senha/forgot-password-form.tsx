"use client";

import Link from "next/link";
import { useState } from "react";

import { SubmitButton } from "~/components/submit-button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/server/better-auth/client";

const GENERIC_SUCCESS =
	"Se este email existir em nossa base, enviamos um link para redefinir a senha. Verifique sua caixa de entrada e o spam.";

export function ForgotPasswordForm() {
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (success) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardDescription className="text-primary">
						Pedido recebido
					</CardDescription>
					<CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<p>{success}</p>
					<Link
						className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						href="/"
					>
						Voltar para entrar
					</Link>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full">
			<CardHeader>
				<CardDescription className="text-primary">
					Recuperar acesso
				</CardDescription>
				<CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={async (event) => {
						event.preventDefault();
						setError(null);
						setIsSubmitting(true);

						const formData = new FormData(event.currentTarget);
						const email = String(formData.get("email") ?? "").trim();

						const result = await authClient.requestPasswordReset({
							email,
							redirectTo: "/redefinir-senha",
						});

						setIsSubmitting(false);

						if (result.error) {
							setError(
								"Não foi possível processar o pedido agora. Tente novamente em instantes.",
							);
							return;
						}

						setSuccess(GENERIC_SUCCESS);
					}}
				>
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							autoComplete="email"
							id="email"
							name="email"
							required
							type="email"
						/>
					</div>

					{error ? <p className="text-destructive text-sm">{error}</p> : null}

					<SubmitButton
						className="mt-2 w-full"
						disabled={isSubmitting}
						pendingLabel="Enviando..."
					>
						{isSubmitting ? "Enviando..." : "Enviar link de redefinição"}
					</SubmitButton>

					<Link
						className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						href="/"
					>
						Voltar para entrar
					</Link>
				</form>
			</CardContent>
		</Card>
	);
}
