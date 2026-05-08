import { parse } from "csv-parse/sync";

export type ImportTemplateConfig = {
	delimiter: "auto" | "," | ";";
	dateFormat: "yyyy-mm-dd" | "dd/mm/yyyy" | "dd-mm-yyyy";
	decimalSeparator: "auto" | "," | ".";
	amountMode: "signed" | "separate";
	dateColumn: string;
	descriptionColumn: string;
	amountColumn?: string;
	incomeAmountColumn?: string;
	expenseAmountColumn?: string;
	kindColumn?: string;
	externalIdColumn?: string;
	categoryColumn?: string;
	notesColumn?: string;
	incomeTokens: string[];
	expenseTokens: string[];
	invertSign: boolean;
};

export type ParsedImportRow = {
	rowNumber: number;
	occurredOn: string | null;
	amountCents: number | null;
	movementType: "income" | "expense" | null;
	originalDescription: string;
	normalizedDescription: string;
	externalId: string | null;
	bankCategory: string | null;
	validationError: string | null;
	hadSensitiveData: boolean;
	parsedData: Record<string, string | boolean | null>;
};

export const defaultTemplateConfig: ImportTemplateConfig = {
	delimiter: "auto",
	dateFormat: "dd/mm/yyyy",
	decimalSeparator: "auto",
	amountMode: "signed",
	dateColumn: "data",
	descriptionColumn: "descricao",
	amountColumn: "valor",
	incomeTokens: ["receita", "credito", "credit", "income", "entrada"],
	expenseTokens: ["despesa", "debito", "debit", "expense", "saida"],
	invertSign: false,
};

export function normalizeImportTemplateConfig(input: unknown) {
	const candidate = typeof input === "object" && input ? input : {};
	const value = candidate as Partial<ImportTemplateConfig>;
	const config: ImportTemplateConfig = {
		...defaultTemplateConfig,
		...value,
		delimiter: enumValue(value.delimiter, ["auto", ",", ";"], "auto"),
		dateFormat: enumValue(
			value.dateFormat,
			["yyyy-mm-dd", "dd/mm/yyyy", "dd-mm-yyyy"],
			"dd/mm/yyyy",
		),
		decimalSeparator: enumValue(
			value.decimalSeparator,
			["auto", ",", "."],
			"auto",
		),
		amountMode: enumValue(value.amountMode, ["signed", "separate"], "signed"),
		dateColumn: nonEmpty(value.dateColumn, defaultTemplateConfig.dateColumn),
		descriptionColumn: nonEmpty(
			value.descriptionColumn,
			defaultTemplateConfig.descriptionColumn,
		),
		amountColumn: optionalNonEmpty(value.amountColumn),
		incomeAmountColumn: optionalNonEmpty(value.incomeAmountColumn),
		expenseAmountColumn: optionalNonEmpty(value.expenseAmountColumn),
		kindColumn: optionalNonEmpty(value.kindColumn),
		externalIdColumn: optionalNonEmpty(value.externalIdColumn),
		categoryColumn: optionalNonEmpty(value.categoryColumn),
		notesColumn: optionalNonEmpty(value.notesColumn),
		incomeTokens: tokenList(
			value.incomeTokens,
			defaultTemplateConfig.incomeTokens,
		),
		expenseTokens: tokenList(
			value.expenseTokens,
			defaultTemplateConfig.expenseTokens,
		),
		invertSign: value.invertSign === true,
	};
	if (config.amountMode === "signed" && !config.amountColumn) {
		config.amountColumn = defaultTemplateConfig.amountColumn;
	}
	return config;
}

const maxCsvBytes = 1_000_000;
const maxRows = 2_000;

export function parseImportCsv(input: string, config: ImportTemplateConfig) {
	if (new TextEncoder().encode(input).length > maxCsvBytes) {
		throw new Error("CSV muito grande para o importador MVP");
	}

	const records = parse(input, {
		bom: true,
		delimiter:
			config.delimiter === "auto" ? detectDelimiter(input) : config.delimiter,
		relax_column_count: true,
		skip_empty_lines: true,
		trim: true,
	}) as string[][];
	if (records.length < 2) throw new Error("CSV precisa ter cabeçalho e linhas");
	if (records.length - 1 > maxRows)
		throw new Error("CSV excede o limite de linhas");

	const headers = records[0]?.map(normalizeHeader) ?? [];
	const indexes = columnIndexes(headers, config);

	return records.slice(1).map((record, index) => {
		const rowNumber = index + 2;
		const rawDate = cell(record, indexes.date);
		const rawDescription = cell(record, indexes.description);
		const rawKind = indexes.kind === null ? "" : cell(record, indexes.kind);
		const rawCategory =
			indexes.category === null ? "" : cell(record, indexes.category);
		const rawExternalId =
			indexes.externalId === null ? "" : cell(record, indexes.externalId);
		const rawNotes = indexes.notes === null ? "" : cell(record, indexes.notes);
		const amount = parseTemplateAmount(record, indexes, config);
		const movementType = parseMovementType(rawKind, amount, config);
		const occurredOn = parseDate(rawDate, config.dateFormat);
		const description = sanitizeSensitive(rawDescription);
		const category = sanitizeSensitive(rawCategory);
		const externalId = sanitizeSensitive(rawExternalId);
		const notes = sanitizeSensitive(rawNotes);
		const normalizedDescription = normalizeDescription(description.value);
		const errors = [
			occurredOn ? null : "data inválida",
			amount === null || amount === 0 ? "valor inválido" : null,
			movementType ? null : "tipo inválido",
			description.value ? null : "descrição obrigatória",
		].filter(Boolean);

		return {
			rowNumber,
			occurredOn,
			amountCents: amount === null ? null : Math.abs(amount),
			movementType,
			originalDescription: description.value.slice(0, 500),
			normalizedDescription,
			externalId: externalId.value || null,
			bankCategory: category.value || null,
			validationError: errors.join("; ") || null,
			hadSensitiveData:
				description.detected ||
				category.detected ||
				externalId.detected ||
				notes.detected,
			parsedData: {
				date: sanitizeSensitive(rawDate).value,
				amount: sanitizeSensitive(rawAmount(record, indexes)).value,
				kind: sanitizeSensitive(rawKind).value || null,
				notes: notes.value || null,
				hadSensitiveData:
					description.detected ||
					category.detected ||
					externalId.detected ||
					notes.detected,
			},
		} satisfies ParsedImportRow;
	});
}

export function duplicateKey(row: {
	accountId: number;
	occurredOn: string;
	amountCents: number;
	movementType: "income" | "expense";
	normalizedDescription: string;
	externalId?: string | null;
}) {
	return [
		row.accountId,
		row.externalId ? normalizeDescription(row.externalId) : "",
		row.occurredOn,
		row.amountCents,
		row.movementType,
		row.normalizedDescription,
	].join("|");
}

export function maskSensitive(value: string) {
	return sanitizeSensitive(value).value;
}

export function sanitizeSensitive(value: string) {
	let detected = false;
	const masked = value
		.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (match) => {
			detected = true;
			return `CPF ${"*".repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`;
		})
		.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
			detected = true;
			const digits = match.replace(/\D/g, "");
			return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
		})
		.replace(/\d{5,}/g, (match) => {
			detected = true;
			return `${"*".repeat(match.length - 4)}${match.slice(-4)}`;
		})
		.replace(
			/\b(senha|password|token|secret|chave)\b\s*[:=]?\s*\S+/gi,
			(_match, label: string) => {
				detected = true;
				return `${label}: ***`;
			},
		);
	return { value: masked.trim(), detected };
}

export function normalizeDescription(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\d{5,}/g, "#")
		.replace(/\s+/g, " ")
		.trim();
}

function enumValue<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
) {
	return typeof value === "string" && allowed.includes(value as T)
		? (value as T)
		: fallback;
}

function nonEmpty(value: unknown, fallback: string) {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalNonEmpty(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tokenList(value: unknown, fallback: string[]) {
	if (!Array.isArray(value)) return fallback;
	const tokens = value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean);
	return tokens.length > 0 ? tokens : fallback;
}

function columnIndexes(headers: string[], config: ImportTemplateConfig) {
	const find = (name?: string) =>
		name ? headers.indexOf(normalizeHeader(name)) : -1;
	const date = find(config.dateColumn);
	const description = find(config.descriptionColumn);
	if (date < 0 || description < 0) {
		throw new Error("CSV não contém as colunas de data e descrição do modelo");
	}
	const amount = find(config.amountColumn);
	const incomeAmount = find(config.incomeAmountColumn);
	const expenseAmount = find(config.expenseAmountColumn);
	if (config.amountMode === "signed" && amount < 0) {
		throw new Error("CSV não contém a coluna de valor do modelo");
	}
	if (
		config.amountMode === "separate" &&
		incomeAmount < 0 &&
		expenseAmount < 0
	) {
		throw new Error("CSV não contém colunas de entrada/saída do modelo");
	}
	return {
		date,
		description,
		amount: amount < 0 ? null : amount,
		incomeAmount: incomeAmount < 0 ? null : incomeAmount,
		expenseAmount: expenseAmount < 0 ? null : expenseAmount,
		kind: find(config.kindColumn) < 0 ? null : find(config.kindColumn),
		externalId:
			find(config.externalIdColumn) < 0 ? null : find(config.externalIdColumn),
		category:
			find(config.categoryColumn) < 0 ? null : find(config.categoryColumn),
		notes: find(config.notesColumn) < 0 ? null : find(config.notesColumn),
	};
}

function detectDelimiter(input: string): "," | ";" {
	const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
	return firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
}

function parseTemplateAmount(
	record: string[],
	indexes: ReturnType<typeof columnIndexes>,
	config: ImportTemplateConfig,
) {
	if (config.amountMode === "signed") {
		const amount = parseMoney(
			indexes.amount === null ? "" : cell(record, indexes.amount),
			config.decimalSeparator,
		);
		return amount === null || !config.invertSign ? amount : -amount;
	}
	const income =
		indexes.incomeAmount === null
			? null
			: parseMoney(cell(record, indexes.incomeAmount), config.decimalSeparator);
	const expense =
		indexes.expenseAmount === null
			? null
			: parseMoney(
					cell(record, indexes.expenseAmount),
					config.decimalSeparator,
				);
	const hasIncome = income !== null && income !== 0;
	const hasExpense = expense !== null && expense !== 0;
	if (hasIncome && hasExpense) return null;
	let amount = hasIncome
		? Math.abs(income)
		: hasExpense
			? -Math.abs(expense)
			: null;
	if (amount !== null && config.invertSign) amount = -amount;
	return amount;
}

function rawAmount(
	record: string[],
	indexes: ReturnType<typeof columnIndexes>,
) {
	if (indexes.amount !== null) return cell(record, indexes.amount);
	return [indexes.incomeAmount, indexes.expenseAmount]
		.filter((index) => index !== null)
		.map((index) => cell(record, index))
		.filter(Boolean)
		.join(" / ");
}

function parseMoney(
	value: string,
	decimalSeparator: ImportTemplateConfig["decimalSeparator"],
) {
	const cleaned = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
	if (!cleaned) return null;
	const negative = cleaned.startsWith("-") || /^\(.+\)$/.test(cleaned);
	const unsigned = cleaned.replace(/[()+-]/g, "");
	const separator =
		decimalSeparator === "auto"
			? unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".")
				? ","
				: "."
			: decimalSeparator;
	const normalized =
		separator === ","
			? unsigned.replace(/\./g, "").replace(",", ".")
			: unsigned.replace(/,/g, "");
	const amount = Number.parseFloat(normalized);
	if (!Number.isFinite(amount)) return null;
	const cents = Math.round(amount * 100);
	return negative ? -cents : cents;
}

function parseMovementType(
	rawKind: string,
	amount: number | null,
	config: ImportTemplateConfig,
) {
	const normalized = normalizeHeader(rawKind);
	if (normalized) {
		if (config.incomeTokens.map(normalizeHeader).includes(normalized)) {
			return "income";
		}
		if (config.expenseTokens.map(normalizeHeader).includes(normalized)) {
			return "expense";
		}
	}
	if (amount === null) return null;
	if (amount > 0) return "income";
	if (amount < 0) return "expense";
	return null;
}

function parseDate(value: string, format: ImportTemplateConfig["dateFormat"]) {
	const trimmed = value.trim();
	const parts = trimmed
		.split(format === "yyyy-mm-dd" ? /-/ : /[/-]/)
		.map(Number);
	const [year, month, day] =
		format === "yyyy-mm-dd" ? parts : [parts[2], parts[1], parts[0]];
	if (!year || !month || !day) return null;
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function cell(row: string[], index: number) {
	return row[index]?.trim() ?? "";
}

function normalizeHeader(value: string) {
	return normalizeDescription(value).replace(/[^a-z0-9]+/g, "");
}
