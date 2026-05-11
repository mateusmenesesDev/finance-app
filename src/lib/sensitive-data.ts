// Política única de dados sigilosos do Finance App.
//
// Toda gravação de texto livre vinda do usuário ou de CSV passa por
// `sanitizeSensitive`. O app não armazena senhas, tokens ou credenciais
// bancárias; CSV bruto não é persistido por padrão.
//
// As regras abaixo são aplicadas em ordem e têm efeito acumulativo: a saída de
// uma regra alimenta a próxima. A ordem importa porque CPF e cartão usam
// padrões mais específicos do que a regra genérica de identificadores longos.

export type SensitiveRule = {
	id: string;
	label: string;
	description: string;
	example: { input: string; output: string };
	pattern: RegExp;
	mask: (match: string, ...captures: string[]) => string;
};

const cpf: SensitiveRule = {
	id: "cpf",
	label: "CPF",
	description: "11 dígitos com ou sem pontuação.",
	example: { input: "123.456.789-00", output: "CPF **********9-00" },
	pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
	mask: (match) =>
		`CPF ${"*".repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`,
};

const cardNumber: SensitiveRule = {
	id: "card-number",
	label: "Número de cartão",
	description: "13 a 19 dígitos consecutivos com separadores opcionais.",
	example: { input: "1234 5678 9012 3456", output: "************3456" },
	pattern: /\b(?:\d[ -]*?){13,19}\b/g,
	mask: (match) => {
		const digits = match.replace(/\D/g, "");
		return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
	},
};

const longDigits: SensitiveRule = {
	id: "long-digits",
	label: "Identificadores numéricos longos",
	description: "Sequências de 5+ dígitos: contas, agências, IDs externos.",
	example: { input: "987654321", output: "*****4321" },
	pattern: /\d{5,}/g,
	mask: (match) => `${"*".repeat(match.length - 4)}${match.slice(-4)}`,
};

const credentials: SensitiveRule = {
	id: "credentials",
	label: "Senhas, tokens e chaves",
	description:
		"Pares com termos como senha, password, token, secret, chave ou api_key.",
	example: { input: "token: abc123", output: "token: ***" },
	pattern:
		/\b(senha|password|token|secret|chave|api[_-]?key)\b\s*[:=]?\s*\S+/gi,
	mask: (_match, label) => `${label}: ***`,
};

export const sensitiveDataRules: readonly SensitiveRule[] = [
	cpf,
	cardNumber,
	longDigits,
	credentials,
];

// Padrões proibidos em nomes de colunas do schema financeiro: o app não deve
// salvar senhas/tokens/credenciais e o teste em `sensitive-data.test.ts`
// falha se alguma tabela `finance_app_*` introduzir uma coluna nesse formato.
export const forbiddenColumnPatterns: readonly RegExp[] = [
	/password/i,
	/senha/i,
	/secret/i,
	/^token$/i,
	/api[_-]?key/i,
	/credential/i,
];

export type SensitivityReport = {
	value: string;
	detected: boolean;
	matchedRuleIds: readonly string[];
};

export function sanitizeSensitive(value: string): SensitivityReport {
	const matched = new Set<string>();
	let result = value;
	for (const rule of sensitiveDataRules) {
		result = result.replace(rule.pattern, (...args) => {
			matched.add(rule.id);
			const match = args[0] as string;
			// Drop trailing offset/string/groups; keep only string captures.
			const captures = args
				.slice(1, -2)
				.filter((arg): arg is string => typeof arg === "string");
			return rule.mask(match, ...captures);
		});
	}
	return {
		value: result.trim(),
		detected: matched.size > 0,
		matchedRuleIds: [...matched],
	};
}

export function maskSensitive(value: string): string {
	return sanitizeSensitive(value).value;
}

export function maskSensitiveOptional(value: string | null | undefined) {
	if (value === null || value === undefined) return value ?? null;
	return maskSensitive(value);
}
