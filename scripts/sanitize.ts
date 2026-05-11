// Re-aplica as regras de mascaramento (sanitizeSensitive) em todo texto livre
// já persistido para um usuário. Idempotente: rodar duas vezes não gera novas
// mudanças. Uso:
//
//   bun run scripts/sanitize.ts --email demo@finance.local
//   bun run scripts/sanitize.ts --user-id <id>
//
// Sem argumentos, falha — sanear "qualquer usuário" por engano não é seguro.

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { sanitizeUserHistory } from "~/server/privacy";

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const userId = await resolveUserId(args);
	console.log(`Sanitizing history for user ${userId}...`);
	const report = await sanitizeUserHistory(userId);
	console.log("\nResultado:");
	for (const [entity, value] of Object.entries(report)) {
		console.log(
			`  ${entity}: ${value.scanned} varridos, ${value.updated} atualizados, ${value.fieldsUpdated} campos alterados`,
		);
	}
}

async function resolveUserId(args: Map<string, string>): Promise<string> {
	const direct = args.get("user-id");
	if (direct) return direct;
	const email = args.get("email");
	if (!email) {
		console.error(
			"Informe --email <email> ou --user-id <id> para evitar varredura cruzada.",
		);
		process.exit(2);
	}
	const found = await db.query.user.findFirst({ where: eq(user.email, email) });
	if (!found) {
		console.error(`Usuário não encontrado: ${email}`);
		process.exit(2);
	}
	return found.id;
}

function parseArgs(argv: string[]) {
	const map = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg?.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next && !next.startsWith("--")) {
			map.set(key, next);
			i += 1;
		} else {
			map.set(key, "");
		}
	}
	return map;
}

await main();
process.exit(0);
