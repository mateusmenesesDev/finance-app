"use client";

import { useState } from "react";

import { authClient } from "~/server/better-auth/client";

const GENERIC_SUCCESS =
	"Se este email existir em nossa base, enviamos um link para redefinir a senha. Verifique sua caixa de entrada e o spam.";

export function ForgotPasswordForm() {
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	if (success) {
		return (
			<div className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6 shadow-2xl shadow-black/10">
				<p className="font-medium text-[color:var(--color-accent)] text-sm">
					Pedido recebido
				</p>
				<p className="mt-3 text-[color:var(--color-text)]">{success}</p>
			</div>
		);
	}

	return (
		<form
			className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6 shadow-2xl shadow-black/10"
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
			<label className="flex flex-col gap-2 text-[color:var(--color-text-muted)] text-sm">
				Email
				<input
					autoComplete="email"
					className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
					name="email"
					required
					type="email"
				/>
			</label>

			{error && (
				<p className="mt-4 text-[color:var(--color-bad)] text-sm">{error}</p>
			)}

			<button
				className="mt-6 w-full rounded-full bg-[color:var(--color-accent-strong)] px-6 py-3 font-semibold text-[color:var(--color-accent-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isSubmitting}
				type="submit"
			>
				{isSubmitting ? "Enviando..." : "Enviar link de redefinição"}
			</button>
		</form>
	);
}
