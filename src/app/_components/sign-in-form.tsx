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
			className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20"
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
				<p className="font-medium text-emerald-300 text-sm">
					{isSignUp ? "Criar acesso" : "Entrar"}
				</p>
				<h2 className="mt-2 font-semibold text-2xl">
					{isSignUp ? "Comece com email e senha" : "Acesse sua conta"}
				</h2>
			</div>

			<div className="mt-6 flex flex-col gap-4">
				{isSignUp && (
					<label className="flex flex-col gap-2 text-slate-200 text-sm">
						Nome
						<input
							autoComplete="name"
							className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
							name="name"
							required
							type="text"
						/>
					</label>
				)}

				<label className="flex flex-col gap-2 text-slate-200 text-sm">
					Email
					<input
						autoComplete="email"
						className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
						name="email"
						required
						type="email"
					/>
				</label>

				<label className="flex flex-col gap-2 text-slate-200 text-sm">
					Senha
					<input
						autoComplete={isSignUp ? "new-password" : "current-password"}
						className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
						minLength={8}
						name="password"
						required
						type="password"
					/>
				</label>
			</div>

			{error && <p className="mt-4 text-red-300 text-sm">{error}</p>}

			<button
				className="mt-6 w-full rounded-full bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isSubmitting}
				type="submit"
			>
				{isSubmitting ? "Enviando..." : isSignUp ? "Criar conta" : "Entrar"}
			</button>

			<button
				className="mt-4 w-full text-slate-300 text-sm underline-offset-4 hover:text-slate-100 hover:underline"
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
