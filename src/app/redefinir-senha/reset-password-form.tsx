"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "~/server/better-auth/client";

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (success) {
		return (
			<div className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6 shadow-2xl shadow-black/10">
				<p className="font-medium text-[color:var(--color-accent)] text-sm">
					Senha redefinida
				</p>
				<p className="mt-3 text-[color:var(--color-text)]">{success}</p>
				<button
					className="mt-6 w-full rounded-full bg-[color:var(--color-accent-strong)] px-6 py-3 font-semibold text-[color:var(--color-accent-text)] transition hover:opacity-90"
					onClick={() => router.push("/")}
					type="button"
				>
					Ir para entrar
				</button>
			</div>
		);
	}

	return (
		<form
			className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6 shadow-2xl shadow-black/10"
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
			<div className="flex flex-col gap-4">
				<label className="flex flex-col gap-2 text-[color:var(--color-text-muted)] text-sm">
					Nova senha
					<input
						autoComplete="new-password"
						className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
						minLength={8}
						name="password"
						required
						type="password"
					/>
				</label>
				<label className="flex flex-col gap-2 text-[color:var(--color-text-muted)] text-sm">
					Confirmar nova senha
					<input
						autoComplete="new-password"
						className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
						minLength={8}
						name="confirm"
						required
						type="password"
					/>
				</label>
			</div>

			{error && (
				<p className="mt-4 text-[color:var(--color-bad)] text-sm">{error}</p>
			)}

			<button
				className="mt-6 w-full rounded-full bg-[color:var(--color-accent-strong)] px-6 py-3 font-semibold text-[color:var(--color-accent-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isSubmitting}
				type="submit"
			>
				{isSubmitting ? "Salvando..." : "Redefinir senha"}
			</button>
		</form>
	);
}
