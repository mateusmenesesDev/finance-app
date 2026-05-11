"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "~/server/better-auth/client";

type AuthMode = "sign-in" | "sign-up";

export function SignInForm() {
	const router = useRouter();
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isSignUp = mode === "sign-up";

	return (
		<form
			className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6 shadow-2xl shadow-black/10"
			onSubmit={async (event) => {
				event.preventDefault();
				setError(null);
				setIsSubmitting(true);

				const formData = new FormData(event.currentTarget);
				const name = String(formData.get("name") ?? "").trim();
				const email = String(formData.get("email") ?? "").trim();
				const password = String(formData.get("password") ?? "");

				const result = isSignUp
					? await authClient.signUp.email({
							email,
							password,
							name,
							callbackURL: "/",
						})
					: await authClient.signIn.email({
							email,
							password,
							callbackURL: "/",
						});

				setIsSubmitting(false);

				if (result.error) {
					setError(
						result.error.message ||
							(isSignUp
								? "Não foi possível criar a conta."
								: "Email ou senha inválidos."),
					);
					return;
				}

				router.refresh();
			}}
		>
			<div>
				<p className="font-medium text-[color:var(--color-accent)] text-sm">
					{isSignUp ? "Criar acesso" : "Entrar"}
				</p>
				<h2 className="mt-2 font-semibold text-2xl">
					{isSignUp ? "Comece com email e senha" : "Acesse sua conta"}
				</h2>
			</div>

			<div className="mt-6 flex flex-col gap-4">
				{isSignUp && (
					<label className="flex flex-col gap-2 text-[color:var(--color-text-muted)] text-sm">
						Nome
						<input
							autoComplete="name"
							className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
							name="name"
							required
							type="text"
						/>
					</label>
				)}

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

				<label className="flex flex-col gap-2 text-[color:var(--color-text-muted)] text-sm">
					Senha
					<input
						autoComplete={isSignUp ? "new-password" : "current-password"}
						className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]"
						minLength={8}
						name="password"
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
				{isSubmitting ? "Enviando..." : isSignUp ? "Criar conta" : "Entrar"}
			</button>

			<button
				className="mt-4 w-full text-[color:var(--color-text-muted)] text-sm underline-offset-4 hover:text-[color:var(--color-text)] hover:underline"
				onClick={() => {
					setError(null);
					setMode(isSignUp ? "sign-in" : "sign-up");
				}}
				type="button"
			>
				{isSignUp ? "Já tenho conta" : "Criar nova conta"}
			</button>
		</form>
	);
}
