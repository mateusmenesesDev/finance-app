export function formatMoney(cents: number) {
	return new Intl.NumberFormat("pt-BR", {
		currency: "BRL",
		style: "currency",
	}).format(cents / 100);
}

export function formatMoneyInput(cents: number) {
	return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatDate(value: string) {
	return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
		new Date(`${value}T00:00:00Z`),
	);
}

export function formatMonthLabel(period: { start: string }) {
	return new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		timeZone: "UTC",
		year: "numeric",
	}).format(new Date(`${period.start}T00:00:00Z`));
}

export function formatPercent(value: number) {
	return new Intl.NumberFormat("pt-BR", {
		maximumFractionDigits: 0,
		style: "percent",
	}).format(value);
}
