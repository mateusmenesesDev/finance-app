"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

type AuthMode = "sign-in" | "sign-up";

export function SignInForm() {
	const router = useRouter();
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const isSignUp = mode === "sign-up";

	return (
		<Card className="w-full">
			<CardHeader>
				<CardDescription className="text-primary">
					{isSignUp ? "Criar acesso" : "Entrar"}
				</CardDescription>
				<CardTitle className="text-2xl">
					{isSignUp ? "Comece com email e senha" : "Acesse sua conta"}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="flex flex-col gap-4"
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
					{isSignUp ? (
						<div className="grid gap-2">
							<Label htmlFor="sign-in-name">Nome</Label>
							<Input
								autoComplete="name"
								id="sign-in-name"
								name="name"
								required
								type="text"
							/>
						</div>
					) : null}

					<div className="grid gap-2">
						<Label htmlFor="sign-in-email">Email</Label>
						<Input
							autoComplete="email"
							id="sign-in-email"
							name="email"
							required
							type="email"
						/>
					</div>

					<div className="grid gap-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="sign-in-password">Senha</Label>
							{!isSignUp ? (
								<Link
									className="text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
									href="/esqueci-senha"
								>
									Esqueci minha senha
								</Link>
							) : null}
						</div>
						<div className="relative">
							<Input
								autoComplete={isSignUp ? "new-password" : "current-password"}
								className="pr-10"
								id="sign-in-password"
								minLength={8}
								name="password"
								required
								type={showPassword ? "text" : "password"}
							/>
							<button
								aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
								aria-pressed={showPassword}
								className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
								onClick={() => setShowPassword((value) => !value)}
								type="button"
							>
								{showPassword ? (
									<EyeOff className="size-4" />
								) : (
									<Eye className="size-4" />
								)}
							</button>
						</div>
					</div>

					{error ? <p className="text-destructive text-sm">{error}</p> : null}

					<Button className="mt-2 w-full" disabled={isSubmitting} type="submit">
						{isSubmitting ? "Enviando..." : isSignUp ? "Criar conta" : "Entrar"}
					</Button>

					<button
						className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						onClick={() => {
							setError(null);
							setMode(isSignUp ? "sign-in" : "sign-up");
						}}
						type="button"
					>
						{isSignUp ? "Já tenho conta" : "Criar nova conta"}
					</button>
				</form>
			</CardContent>
		</Card>
	);
}
