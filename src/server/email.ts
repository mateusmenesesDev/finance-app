import "server-only";

import { Resend } from "resend";

import { env } from "~/env";

type EmailPayload = {
	to: string;
	subject: string;
	html: string;
	text: string;
};

let resendClient: Resend | null = null;

function getResend(): Resend | null {
	if (!env.RESEND_API_KEY) return null;
	if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
	return resendClient;
}

/**
 * Envia um email transacional.
 *
 * Em dev sem `RESEND_API_KEY`/`EMAIL_FROM`, registra o conteúdo no console
 * para que o desenvolvedor copie o link manualmente. Em produção o `env.js`
 * exige ambas as variáveis, então este fallback nunca dispara.
 */
export async function sendTransactionalEmail(payload: EmailPayload) {
	const resend = getResend();
	if (!resend || !env.EMAIL_FROM) {
		console.info(
			`[email:dev] to=${payload.to} subject=${payload.subject}\n${payload.text}`,
		);
		return;
	}

	const result = await resend.emails.send({
		from: env.EMAIL_FROM,
		to: payload.to,
		subject: payload.subject,
		html: payload.html,
		text: payload.text,
	});

	if (result.error) {
		console.error("[email] falha ao enviar via Resend", result.error);
	}
}
