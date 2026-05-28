const monthNameToNumber: ReadonlyMap<string, number> = new Map([
	["janeiro", 1],
	["jan", 1],
	["fevereiro", 2],
	["fev", 2],
	["marco", 3],
	["mar", 3],
	["abril", 4],
	["abr", 4],
	["maio", 5],
	["mai", 5],
	["junho", 6],
	["jun", 6],
	["julho", 7],
	["jul", 7],
	["agosto", 8],
	["ago", 8],
	["setembro", 9],
	["set", 9],
	["outubro", 10],
	["out", 10],
	["novembro", 11],
	["nov", 11],
	["dezembro", 12],
	["dez", 12],
] as const);

function normalizeMonthText(value: string) {
	return value
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function formatMonthKey(year: number, month: number) {
	return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(value: string) {
	const normalized = normalizeMonthText(value);
	const match = /^(\d{4})-(\d{2})$/.exec(normalized);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return formatMonthKey(year, month);
}

export function parseInvoiceMonthKey(
	value: string,
	currentYear = new Date().getFullYear(),
) {
	const monthKey = parseMonthKey(value);
	if (monthKey) return monthKey;

	const normalized = normalizeMonthText(value);
	if (/^\d{1,2}$/.test(normalized)) {
		const month = Number(normalized);
		if (month >= 1 && month <= 12) return formatMonthKey(currentYear, month);
	}

	const namedMonth = monthNameToNumber.get(normalized);
	if (namedMonth) return formatMonthKey(currentYear, namedMonth);

	return null;
}
