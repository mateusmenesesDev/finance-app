"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SubmitButton } from "~/components/submit-button";
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
import { authClient } from "~/server/better-auth/client";

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (success) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardDescription className="text-primary">
						Senha redefinida
					</CardDescription>
					<CardTitle className="text-2xl">Redefinir senha</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<p>{success}</p>
					<Button
						className="w-full"
						onClick={() => router.push("/")}
						type="button"
					>
						Ir para entrar
					</Button>
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
				<CardTitle className="text-2xl">Redefinir senha</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={async (event) => {
						event.preventDefault();
						setError(null);

						const formData = new FormData(event.currentTarget);
						const password = String(formData.get("password") ?? "");
						const confirm = String(formData.get("confirm") ?? "");

						if (password.length < 8) {
							setError("A senha precisa ter pelo menos 8 caracteres.");
							return;
						}
						if (password !== confirm) {
							setError("A confirmação não bate com a nova senha.");
							return;
						}

						setIsSubmitting(true);
						const result = await authClient.resetPassword({
							newPassword: password,
							token,
						});
						setIsSubmitting(false);

						if (result.error) {
							const code = result.error.code ?? "";
							if (
								code.includes("TOKEN") ||
								code.includes("EXPIRED") ||
								code.includes("INVALID")
							) {
								setError(
									"Este link de redefinição é inválido ou expirou. Peça um novo.",
								);
								return;
							}
							setError(
								result.error.message ||
									"Não foi possível redefinir a senha. Tente novamente.",
							);
							return;
						}

						setSuccess(
							"Sua senha foi atualizada. Use a nova senha para entrar na sua conta.",
						);
					}}
				>
					<div className="grid gap-2">
						<Label htmlFor="password">Nova senha</Label>
						<Input
							autoComplete="new-password"
							id="password"
							minLength={8}
							name="password"
							required
							type="password"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="confirm">Confirmar nova senha</Label>
						<Input
							autoComplete="new-password"
							id="confirm"
							minLength={8}
							name="confirm"
							required
							type="password"
						/>
					</div>

					{error ? <p className="text-destructive text-sm">{error}</p> : null}

					<SubmitButton
						className="mt-2 w-full"
						disabled={isSubmitting}
						pendingLabel="Salvando..."
					>
						{isSubmitting ? "Salvando..." : "Redefinir senha"}
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
