// Maximum cents value persistable in any `amount_cents` column.
// All money columns in the schema are Postgres `integer` (signed int32), so
// anything beyond this either overflows or, worse, gets stringified by the JS
// driver in scientific notation and rejected by `pg_strtoint32_safe`.
// Centralizing the cap here keeps the import parser and form helpers in sync.
export const MAX_AMOUNT_CENTS = 2_147_483_647;

export function moneyToCents(
	value: string,
	{ allowZero }: { allowZero: boolean },
) {
	const normalized = value.replace(/\./g, "").replace(",", ".");
	const amount = Number.parseFloat(normalized);
	if (!Number.isFinite(amount) || amount < 0) throw new Error("Valor inválido");
	if (!allowZero && amount === 0)
		throw new Error("Valor deve ser maior que zero");
	const cents = Math.round(amount * 100);
	if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) {
		throw new Error("Valor excede o limite suportado");
	}
	return cents;
}
