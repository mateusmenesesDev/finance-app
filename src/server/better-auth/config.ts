import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { env } from "~/env";
import { db } from "~/server/db";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg", // or "pg" or "mysql"
	}),
	emailAndPassword: {
		enabled: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			const subject = "Redefinir senha do Finance App";
			const text = [
				`Olá${user.name ? `, ${user.name}` : ""}.`,
				"",
				"Recebemos um pedido para redefinir a senha da sua conta.",
				"Abra o link abaixo para escolher uma nova senha. O link expira em 1 hora e pode ser usado apenas uma vez.",
				"",
				url,
				"",
				"Se você não solicitou, ignore esta mensagem — sua senha continua a mesma.",
			].join("\n");
			const html = `
				<p>Olá${user.name ? `, ${user.name}` : ""}.</p>
				<p>Recebemos um pedido para redefinir a senha da sua conta no Finance App.</p>
				<p>Abra o link abaixo para escolher uma nova senha. O link expira em 1 hora e pode ser usado apenas uma vez.</p>
				<p><a href="${url}">${url}</a></p>
				<p>Se você não solicitou, ignore esta mensagem — sua senha continua a mesma.</p>
			`;

			// Não aguardar: evita timing attacks que diferenciem email existente.
			void import("~/server/email").then(({ sendTransactionalEmail }) =>
				sendTransactionalEmail({
					to: user.email,
					subject,
					text,
					html,
				}),
			);
		},
	},
	plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
