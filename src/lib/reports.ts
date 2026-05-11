import {
	aggregateCashFlow,
	bucketRange,
	type CashFlowAccount,
	type CashFlowTransaction,
	type Granularity,
} from "./cash-flow";
import {
	type BudgetScope,
	buildBudgetUsage,
	getInvoiceForDate,
	type MovementType,
	parseMonthPeriod,
	type RuleBudget,
	type RuleCategory,
	type RuleCategoryGroup,
	type RuleTransaction,
} from "./finance-rules";

export type { Granularity } from "./cash-flow";
export type ReportPreset =
	| "current_month"
	| "last_30d"
	| "last_90d"
	| "last_6m"
	| "current_year"
	| "last_12m"
	| "custom";
export type ReportFilters = {
	from: string;
	to: string;
	preset: ReportPreset;
	granularity: Granularity;
	accountId?: number;
	groupId?: number;
	categoryId?: number;
	movementType?: MovementType;
};
export type ReportRange = Pick<ReportFilters, "from" | "to">;
export type ReportPanelId =
	| "income_expense"
	| "categories"
	| "groups"
	| "accounts"
	| "cards"
	| "budget"
	| "cash_flow";

const presets = new Set<ReportPreset>([
	"current_month",
	"last_30d",
	"last_90d",
	"last_6m",
	"current_year",
	"last_12m",
	"custom",
]);
const granularities = new Set<Granularity>(["day", "week", "month", "year"]);
const movementTypes = new Set<MovementType>([
	"income",
	"expense",
	"transfer",
	"credit_card_payment",
	"balance_adjustment",
]);
export const reportPanelIds: ReportPanelId[] = [
	"income_expense",
	"categories",
	"groups",
	"accounts",
	"cards",
	"budget",
	"cash_flow",
];

export function parseReportFilters(
	searchParams:
		| Record<string, string | string[] | undefined>
		| URLSearchParams
		| undefined,
	today: string,
): ReportFilters {
	const get = (key: string) => {
		if (!searchParams) return undefined;
		const value =
			searchParams instanceof URLSearchParams
				? searchParams.get(key)
				: searchParams[key];
		return Array.isArray(value) ? value[0] : (value ?? undefined);
	};
	const presetValue = get("preset");
	const preset = presets.has(presetValue as ReportPreset)
		? (presetValue as ReportPreset)
		: "current_month";
	const customFrom = validDate(get("from")) ? get("from") : undefined;
	const customTo = validDate(get("to")) ? get("to") : undefined;
	let range = presetRange(preset, today);
	if (preset === "custom" && customFrom && customTo)
		range = { from: customFrom, to: customTo };
	if (range.from > range.to)
		throw new Error("Período inválido: data inicial maior que a final.");
	const granularityValue = get("granularity");
	const granularity = granularities.has(granularityValue as Granularity)
		? (granularityValue as Granularity)
		: "month";
	return {
		...range,
		preset,
		granularity,
		accountId: parsePositiveInt(get("accountId")),
		categoryId: parsePositiveInt(get("categoryId")),
		groupId: parsePositiveInt(get("groupId")),
		movementType: movementTypes.has(get("type") as MovementType)
			? (get("type") as MovementType)
			: undefined,
	};
}

export function suggestGranularity(range: ReportRange): Granularity {
	const days = daysInclusive(range.from, range.to);
	if (days <= 60) return "day";
	if (days <= 180) return "week";
	if (days <= 540) return "month";
	return "year";
}

export function granularityWarning(
	range: ReportRange,
	granularity: Granularity,
) {
	const count = bucketRange(range.from, range.to, granularity).length;
	if (count < 2)
		return "A granularidade escolhida gera poucos pontos para visualização.";
	if (count > 120)
		return "A granularidade escolhida gera muitos pontos; considere agrupar por semana, mês ou ano.";
	return null;
}

export function applyTransactionFilters<T extends RuleTransaction>(
	transactions: T[],
	filters: ReportFilters,
	categoryIndex: Map<number, number>,
) {
	return transactions.filter((transaction) => {
		if (transaction.isArchived) return false;
		if (
			transaction.occurredOn < filters.from ||
			transaction.occurredOn > filters.to
		)
			return false;
		if (
			filters.accountId &&
			transaction.accountId !== filters.accountId &&
			transaction.destinationAccountId !== filters.accountId
		)
			return false;
		if (filters.categoryId && transaction.categoryId !== filters.categoryId)
			return false;
		if (
			filters.groupId &&
			(!transaction.categoryId ||
				categoryIndex.get(transaction.categoryId) !== filters.groupId)
		)
			return false;
		if (
			filters.movementType &&
			transaction.movementType !== filters.movementType
		)
			return false;
		return true;
	});
}

export function incomeExpenseSeries(
	transactions: RuleTransaction[],
	range: ReportRange,
	granularity: Granularity,
) {
	const buckets = bucketRange(range.from, range.to, granularity).map(
		(bucket) => ({ ...bucket, incomeCents: 0, expenseCents: 0, netCents: 0 }),
	);
	const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
	for (const transaction of transactions) {
		if (transaction.status !== "confirmed") continue;
		if (
			transaction.movementType !== "income" &&
			transaction.movementType !== "expense"
		)
			continue;
		const bucket = byKey.get(bucketKeyFor(transaction.occurredOn, granularity));
		if (!bucket) continue;
		if (transaction.movementType === "income")
			bucket.incomeCents += transaction.amountCents;
		else bucket.expenseCents += transaction.amountCents;
		bucket.netCents = bucket.incomeCents - bucket.expenseCents;
	}
	return buckets;
}

export function categoryRanking(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	range: ReportRange,
	granularity: Granularity,
	topN = 10,
) {
	const categoryById = new Map(
		categories.map((category) => [category.id, category]),
	);
	return rankingBy(
		transactions,
		range,
		granularity,
		topN,
		(transaction) => transaction.categoryId ?? null,
		(id) => categoryById.get(id)?.name ?? "Sem categoria",
	);
}

export function groupRanking(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	range: ReportRange,
	granularity: Granularity,
	topN = 10,
) {
	const categoryById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const groupById = new Map(groups.map((group) => [group.id, group]));
	return rankingBy(
		transactions,
		range,
		granularity,
		topN,
		(transaction) =>
			transaction.categoryId
				? (categoryById.get(transaction.categoryId)?.groupId ?? null)
				: null,
		(id) => groupById.get(id)?.name ?? "Sem grupo",
	);
}

export function accountMovement(
	transactions: RuleTransaction[],
	accounts: (CashFlowAccount & { name: string })[],
) {
	const rows = accounts
		.filter((account) => !account.isArchived)
		.map((account) => ({
			accountId: account.id,
			accountName: account.name,
			inflowCents: 0,
			outflowCents: 0,
			netCents: 0,
		}));
	const byId = new Map(rows.map((row) => [row.accountId, row]));
	for (const transaction of transactions) {
		if (transaction.status !== "confirmed") continue;
		const source = byId.get(transaction.accountId);
		if (transaction.movementType === "income" && source)
			source.inflowCents += transaction.amountCents;
		if (
			source &&
			["expense", "credit_card_payment", "transfer"].includes(
				transaction.movementType,
			)
		)
			source.outflowCents += transaction.amountCents;
		if (
			transaction.destinationAccountId &&
			["transfer", "credit_card_payment"].includes(transaction.movementType)
		) {
			const destination = byId.get(transaction.destinationAccountId);
			if (destination) destination.inflowCents += transaction.amountCents;
		}
	}
	for (const row of rows) row.netCents = row.inflowCents - row.outflowCents;
	return rows.sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
}

export function cardInvoiceSeries(
	transactions: RuleTransaction[],
	accounts: (CashFlowAccount & { name: string })[],
	range: ReportRange,
) {
	const cards = accounts.filter(
		(account) => account.type === "credit_card" && !account.isArchived,
	);
	const cardById = new Map(cards.map((account) => [account.id, account]));
	const totals = new Map<
		string,
		{
			accountId: number;
			accountName: string;
			monthKey: string;
			totalCents: number;
		}
	>();
	for (const transaction of transactions) {
		const account = cardById.get(transaction.accountId);
		if (
			!account ||
			transaction.status !== "confirmed" ||
			transaction.movementType !== "expense"
		)
			continue;
		const invoice = getInvoiceForDate(
			transaction.occurredOn,
			account.creditCardClosingDay ?? 31,
			account.creditCardDueDay ?? 10,
		);
		if (`${invoice.key}-01` > range.to || monthEnd(invoice.key) < range.from)
			continue;
		const key = `${account.id}:${invoice.key}`;
		const row = totals.get(key) ?? {
			accountId: account.id,
			accountName: account.name,
			monthKey: invoice.key,
			totalCents: 0,
		};
		row.totalCents += transaction.amountCents;
		totals.set(key, row);
	}
	return [...totals.values()].sort(
		(a, b) =>
			a.monthKey.localeCompare(b.monthKey) ||
			a.accountName.localeCompare(b.accountName),
	);
}

export function budgetVsActual(
	transactions: RuleTransaction[],
	budgets: RuleBudget[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	range: ReportRange,
) {
	return monthsIntersecting(range).flatMap((monthKey) => {
		const period = parseMonthPeriod(monthKey);
		if (!period) return [];
		return buildBudgetUsage(
			budgets.filter((budget) => budget.monthKey === monthKey),
			transactions,
			categories,
			groups,
			period,
		).map((usage) => ({
			monthKey,
			scope: usage.scope as BudgetScope,
			refId: usage.refId,
			name: usage.name,
			plannedCents: usage.plannedCents,
			spentCents: usage.spentCents,
			remainingCents: usage.remainingCents,
			percent: usage.percent,
		}));
	});
}

export function cashFlowSeries(input: {
	accounts: CashFlowAccount[];
	transactions: CashFlowTransaction[];
	range: ReportRange;
	granularity: Granularity;
	accountId?: number;
	today: string;
}) {
	return aggregateCashFlow({
		accounts: input.accounts,
		transactions: input.transactions,
		window: { start: input.range.from, end: input.range.to },
		granularity: input.granularity,
		accountFilter: input.accountId ?? "all",
		today: input.today,
	});
}

export type CsvColumn<T> = {
	header: string;
	value: (row: T) => string | number | null | undefined;
};
export function serializeCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
	const lines = [columns.map((column) => escapeCsv(column.header)).join(";")];
	for (const row of rows)
		lines.push(columns.map((column) => escapeCsv(column.value(row))).join(";"));
	return `\uFEFF${lines.join("\r\n")}`;
}
export function csvHeaders(filename: string) {
	return {
		"Content-Type": "text/csv; charset=utf-8",
		"Content-Disposition": `attachment; filename="${filename}"`,
	};
}
export const columnText = <T>(
	header: string,
	value: (row: T) => string | null | undefined,
): CsvColumn<T> => ({ header, value });
export const columnDate = <T>(
	header: string,
	value: (row: T) => string,
): CsvColumn<T> => ({ header, value: (row) => brDate(value(row)) });
export const columnMoney = <T>(
	header: string,
	value: (row: T) => number,
): CsvColumn<T> => ({
	header,
	value: (row) => (value(row) / 100).toFixed(2).replace(".", ","),
});
export const columnInt = <T>(
	header: string,
	value: (row: T) => number,
): CsvColumn<T> => ({ header, value });

function rankingBy(
	transactions: RuleTransaction[],
	range: ReportRange,
	granularity: Granularity,
	topN: number,
	getId: (transaction: RuleTransaction) => number | null,
	getName: (id: number) => string,
) {
	const buckets = bucketRange(range.from, range.to, granularity);
	const includeSeries = granularity !== "year" && buckets.length <= 12;
	const rows = new Map<
		number,
		{
			id: number;
			name: string;
			totalCents: number;
			series?: Record<string, number>;
		}
	>();
	for (const transaction of transactions) {
		if (
			transaction.status !== "confirmed" ||
			transaction.movementType !== "expense"
		)
			continue;
		const id = getId(transaction) ?? 0;
		const row = rows.get(id) ?? {
			id,
			name: id ? getName(id) : "Sem categoria",
			totalCents: 0,
			series: includeSeries
				? Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))
				: undefined,
		};
		row.totalCents += transaction.amountCents;
		if (row.series)
			row.series[bucketKeyFor(transaction.occurredOn, granularity)] =
				(row.series[bucketKeyFor(transaction.occurredOn, granularity)] ?? 0) +
				transaction.amountCents;
		rows.set(id, row);
	}
	return [...rows.values()]
		.sort((a, b) => b.totalCents - a.totalCents)
		.slice(0, topN);
}
function presetRange(preset: ReportPreset, today: string): ReportRange {
	const date = parseIso(today);
	if (preset === "last_30d") return { from: addDays(today, -29), to: today };
	if (preset === "last_90d") return { from: addDays(today, -89), to: today };
	if (preset === "last_6m")
		return {
			from: formatDate(
				new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 5, 1)),
			),
			to: today,
		};
	if (preset === "current_year")
		return {
			from: `${today.slice(0, 4)}-01-01`,
			to: `${today.slice(0, 4)}-12-31`,
		};
	if (preset === "last_12m")
		return {
			from: formatDate(
				new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 11, 1)),
			),
			to: today,
		};
	return { from: `${today.slice(0, 7)}-01`, to: monthEnd(today.slice(0, 7)) };
}
function parsePositiveInt(value?: string) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function validDate(value?: string) {
	return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function parseIso(value: string) {
	return new Date(`${value}T00:00:00Z`);
}
function formatDate(date: Date) {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function addDays(value: string, days: number) {
	const date = parseIso(value);
	date.setUTCDate(date.getUTCDate() + days);
	return formatDate(date);
}
function daysInclusive(from: string, to: string) {
	return (
		Math.floor(
			(parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000,
		) + 1
	);
}
function monthEnd(monthKey: string) {
	const [year, month] = monthKey.split("-").map(Number);
	return formatDate(new Date(Date.UTC(year ?? 0, month ?? 1, 0)));
}
function monthsIntersecting(range: ReportRange) {
	const months: string[] = [];
	const cursor = new Date(
		Date.UTC(
			Number(range.from.slice(0, 4)),
			Number(range.from.slice(5, 7)) - 1,
			1,
		),
	);
	const final = new Date(
		Date.UTC(Number(range.to.slice(0, 4)), Number(range.to.slice(5, 7)) - 1, 1),
	);
	while (cursor <= final) {
		months.push(
			`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
		);
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return months;
}
function bucketKeyFor(date: string, granularity: Granularity) {
	return bucketRange(date, date, granularity)[0]?.key ?? date;
}
function brDate(value: string) {
	return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}
function escapeCsv(value: string | number | null | undefined) {
	const text = value == null ? "" : String(value);
	return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
