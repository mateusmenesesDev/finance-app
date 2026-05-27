import {
	type AccountKind,
	calculateAccountBalances,
	getInvoiceForDate,
	type MovementType,
	type RuleAccount,
	type RuleTransaction,
} from "./finance-rules";

export type Granularity = "day" | "week" | "month" | "year";

export type CashFlowAccount = RuleAccount & {
	name?: string;
	isArchived?: boolean;
};
export type CashFlowTransaction = RuleTransaction & {
	id?: number;
	description?: string;
	originalDescription?: string | null;
};
export type CashFlowCard = {
	id: number;
	name: string;
	isArchived?: boolean;
};
export type CashFlowCardInvoice = {
	id: number;
	cardId: number;
	monthKey: string;
	closingDate: string;
	dueDate: string;
	isArchived?: boolean;
};
export type PlannedMovement = {
	accountId: number;
	amountCents: number;
	movementType: MovementType;
	occurredOn: string;
};
export type CashFlowWindow = { start: string; end: string };
export type AccountFilter = "all" | number;
export type ImportRowForPending = {
	id: number;
	batchId: number;
	rowNumber: number;
	status: string;
	amountCents: number | null;
	movementType: MovementType | null;
	occurredOn: string | null;
	originalDescription: string | null;
};

export type BucketDescriptor = {
	key: string;
	start: string;
	end: string;
	label: string;
};

export type FutureInvoice = {
	accountId: number;
	accountName: string;
	key: string;
	closingDate: string;
	dueDate: string;
	totalCents: number;
	paidCents: number;
	remainingCents: number;
};

export type CashFlowBucket = BucketDescriptor & {
	realizedIncome: number;
	realizedExpense: number;
	plannedIncome: number;
	plannedExpense: number;
	invoiceOutflow: number;
};

const availableAccountTypes = new Set<AccountKind>([
	"checking",
	"savings",
	"cash",
]);

export function bucketKey(dateIso: string, granularity: Granularity) {
	const date = parseDate(dateIso);
	if (granularity === "day") return dateIso;
	if (granularity === "month") return dateIso.slice(0, 7);
	if (granularity === "year") return dateIso.slice(0, 4);
	const monday = startOfIsoWeek(date);
	return `${formatDate(monday)}-W${String(isoWeekNumber(monday)).padStart(2, "0")}`;
}

export function bucketRange(
	start: string,
	end: string,
	granularity: Granularity,
): BucketDescriptor[] {
	const buckets: BucketDescriptor[] = [];
	let cursor = bucketStart(parseDate(start), granularity);
	const final = parseDate(end);
	while (cursor <= final) {
		const bucketEndDate = minDate(bucketEnd(cursor, granularity), final);
		const bucketStartDate = maxDate(cursor, parseDate(start));
		const startIso = formatDate(bucketStartDate);
		const endIso = formatDate(bucketEndDate);
		buckets.push({
			key: bucketKey(formatDate(cursor), granularity),
			start: startIso,
			end: endIso,
			label: labelForBucket(formatDate(cursor), granularity),
		});
		cursor = addDays(bucketEnd(cursor, granularity), 1);
	}
	return buckets;
}

export function defaultWindow(granularity: Granularity, today: string) {
	if (granularity === "day")
		return { start: today, end: addDaysIso(today, 29) };
	if (granularity === "week")
		return { start: today, end: addDaysIso(today, 83) };
	if (granularity === "month")
		return { start: today, end: addMonthsIso(today, 12) };
	return { start: today, end: addYearsIso(today, 3) };
}

// Payment heuristic: for each future invoice cycle, sum confirmed card expenses in
// that cycle and subtract confirmed credit_card_payment transactions to the card
// dated on/before the invoice due date and after the cycle closing date. If the
// remaining amount is <= 0, the cycle is considered paid and omitted.
export function computeFutureInvoices(
	accounts: CashFlowAccount[],
	transactions: CashFlowTransaction[],
	today: string,
	persistedInvoices?: CashFlowCardInvoice[],
	cards?: CashFlowCard[],
): FutureInvoice[] {
	if (persistedInvoices && cards) {
		return computePersistedFutureInvoices(
			cards,
			persistedInvoices,
			transactions,
			today,
		);
	}
	const cardAccounts = accounts.filter(
		(account) => account.type === "credit_card" && !account.isArchived,
	);
	const invoices = new Map<string, FutureInvoice>();

	for (const account of cardAccounts) {
		for (const transaction of transactions) {
			if (
				transaction.isArchived ||
				transaction.status !== "confirmed" ||
				transaction.accountId !== account.id ||
				transaction.movementType !== "expense"
			)
				continue;
			const invoice = getInvoiceForDate(
				transaction.occurredOn,
				account.creditCardClosingDay ?? 31,
				account.creditCardDueDay ?? 10,
			);
			if (invoice.dueDate < today) continue;
			const key = `${account.id}:${invoice.key}`;
			const saved = invoices.get(key) ?? {
				accountId: account.id,
				accountName: account.name ?? `Cartão ${account.id}`,
				key: invoice.key,
				closingDate: invoice.closingDate,
				dueDate: invoice.dueDate,
				totalCents: 0,
				paidCents: 0,
				remainingCents: 0,
			};
			saved.totalCents += transaction.amountCents;
			invoices.set(key, saved);
		}
	}

	for (const invoice of invoices.values()) {
		invoice.paidCents = transactions.reduce((total, transaction) => {
			if (
				transaction.isArchived ||
				transaction.status !== "confirmed" ||
				transaction.movementType !== "credit_card_payment" ||
				transaction.destinationAccountId !== invoice.accountId ||
				transaction.occurredOn <= invoice.closingDate ||
				transaction.occurredOn > invoice.dueDate
			)
				return total;
			return total + transaction.amountCents;
		}, 0);
		invoice.remainingCents = Math.max(
			0,
			invoice.totalCents - invoice.paidCents,
		);
	}

	return [...invoices.values()]
		.filter((invoice) => invoice.remainingCents > 0)
		.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

function computePersistedFutureInvoices(
	cards: CashFlowCard[],
	invoices: CashFlowCardInvoice[],
	transactions: CashFlowTransaction[],
	today: string,
): FutureInvoice[] {
	const cardById = new Map(
		cards.filter((card) => !card.isArchived).map((card) => [card.id, card]),
	);
	return invoices
		.filter((invoice) => !invoice.isArchived && invoice.dueDate >= today)
		.map((invoice) => {
			const card = cardById.get(invoice.cardId);
			if (!card) return null;
			let totalCents = 0;
			let paidCents = 0;
			for (const transaction of transactions) {
				if (
					transaction.isArchived ||
					transaction.status !== "confirmed" ||
					transaction.cardInvoiceId !== invoice.id
				) {
					continue;
				}
				if (transaction.movementType === "credit_card_payment") {
					paidCents += transaction.amountCents;
					continue;
				}
				if (transaction.movementType === "expense") {
					totalCents +=
						transaction.cardEntryKind === "credit"
							? -transaction.amountCents
							: transaction.amountCents;
				}
			}
			return {
				accountId: card.id,
				accountName: card.name,
				key: invoice.monthKey,
				closingDate: invoice.closingDate,
				dueDate: invoice.dueDate,
				totalCents,
				paidCents,
				remainingCents: Math.max(0, totalCents - paidCents),
			};
		})
		.filter((invoice): invoice is FutureInvoice => Boolean(invoice))
		.filter((invoice) => invoice.remainingCents > 0)
		.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

export function aggregateCashFlow(input: {
	accounts: CashFlowAccount[];
	transactions: CashFlowTransaction[];
	window: CashFlowWindow;
	granularity: Granularity;
	accountFilter?: AccountFilter;
	today: string;
	extraPlannedMovements?: PlannedMovement[];
	cards?: CashFlowCard[];
	cardInvoices?: CashFlowCardInvoice[];
}) {
	const buckets = bucketRange(
		input.window.start,
		input.window.end,
		input.granularity,
	).map((bucket) => ({
		...bucket,
		realizedIncome: 0,
		realizedExpense: 0,
		plannedIncome: 0,
		plannedExpense: 0,
		invoiceOutflow: 0,
	}));
	const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
	const creditCardAccountIds = new Set(
		input.accounts
			.filter((account) => account.type === "credit_card")
			.map((account) => account.id),
	);
	let pendingTransactionCount = 0;
	let pendingTransactionCents = 0;

	for (const transaction of input.transactions) {
		if (
			transaction.isArchived ||
			!inWindow(transaction.occurredOn, input.window)
		)
			continue;
		if (!matchesAccountFilter(transaction, input.accountFilter ?? "all"))
			continue;
		// Card purchases are not cash flow — they only move money on invoice payment,
		// which `computeFutureInvoices` and `credit_card_payment` transactions handle.
		if (
			transaction.movementType !== "credit_card_payment" &&
			transaction.accountId !== null &&
			creditCardAccountIds.has(transaction.accountId)
		)
			continue;
		const bucket = byKey.get(
			bucketKey(transaction.occurredOn, input.granularity),
		);
		if (!bucket) continue;
		if (transaction.status === "pending_review") {
			pendingTransactionCount++;
			pendingTransactionCents += transaction.amountCents;
			continue;
		}
		if (transaction.status !== "confirmed" && transaction.status !== "planned")
			continue;
		if (transaction.status === "confirmed")
			addTransaction(bucket, transaction, "realized");
		if (transaction.status === "planned")
			addTransaction(bucket, transaction, "planned");
	}

	for (const movement of input.extraPlannedMovements ?? []) {
		if (!inWindow(movement.occurredOn, input.window)) continue;
		if (
			(input.accountFilter ?? "all") !== "all" &&
			movement.accountId !== input.accountFilter
		)
			continue;
		if (
			movement.movementType !== "credit_card_payment" &&
			creditCardAccountIds.has(movement.accountId)
		)
			continue;
		const bucket = byKey.get(bucketKey(movement.occurredOn, input.granularity));
		if (bucket) addMovement(bucket, movement, "planned");
	}

	if ((input.accountFilter ?? "all") === "all") {
		for (const invoice of computeFutureInvoices(
			input.accounts,
			input.transactions,
			input.today,
			input.cardInvoices,
			input.cards,
		)) {
			if (!inWindow(invoice.dueDate, input.window)) continue;
			const bucket = byKey.get(bucketKey(invoice.dueDate, input.granularity));
			if (bucket) bucket.invoiceOutflow += invoice.remainingCents;
		}
	}

	const totals = buckets.reduce(
		(total, bucket) => ({
			realizedIncome: total.realizedIncome + bucket.realizedIncome,
			realizedExpense: total.realizedExpense + bucket.realizedExpense,
			plannedIncome: total.plannedIncome + bucket.plannedIncome,
			plannedExpense: total.plannedExpense + bucket.plannedExpense,
			invoiceOutflow: total.invoiceOutflow + bucket.invoiceOutflow,
		}),
		{
			realizedIncome: 0,
			realizedExpense: 0,
			plannedIncome: 0,
			plannedExpense: 0,
			invoiceOutflow: 0,
		},
	);
	return {
		buckets,
		totals,
		pending: {
			transactionCount: pendingTransactionCount,
			amountCents: pendingTransactionCents,
		},
	};
}

export function projectAccountBalances(input: {
	accounts: CashFlowAccount[];
	transactions: CashFlowTransaction[];
	window: CashFlowWindow;
	today: string;
	extraPlannedMovements?: PlannedMovement[];
}) {
	const balances = calculateAccountBalances(input.accounts, input.transactions);
	const accounts = input.accounts.filter(
		(account) => availableAccountTypes.has(account.type) && !account.isArchived,
	);
	return accounts.map((account) => {
		let running = balances.get(account.id)?.normalBalanceCents ?? 0;
		let minCents = running;
		let minDate = input.window.start;
		const dailyBalances: { date: string; balanceCents: number }[] = [];
		for (const day of dateRange(input.window.start, input.window.end)) {
			for (const movement of plannedMovementsForDay(
				account.id,
				day,
				input.transactions,
				input.extraPlannedMovements,
			)) {
				running += movementDelta(movement);
			}
			dailyBalances.push({ date: day, balanceCents: running });
			if (running < minCents) {
				minCents = running;
				minDate = day;
			}
		}
		return {
			accountId: account.id,
			accountName: account.name ?? `Conta ${account.id}`,
			openingCents: balances.get(account.id)?.normalBalanceCents ?? 0,
			closingProjectedCents: running,
			minCents,
			minDate,
			dailyBalances,
		};
	});
}

export function consolidatedTimeline(input: {
	accounts: CashFlowAccount[];
	transactions: CashFlowTransaction[];
	window: CashFlowWindow;
	granularity: Granularity;
	today: string;
	extraPlannedMovements?: PlannedMovement[];
}) {
	const aggregate = aggregateCashFlow({ ...input, accountFilter: "all" });
	const balances = calculateAccountBalances(input.accounts, input.transactions);
	let running = input.accounts.reduce(
		(total, account) =>
			availableAccountTypes.has(account.type)
				? total + (balances.get(account.id)?.normalBalanceCents ?? 0)
				: total,
		0,
	);
	return aggregate.buckets.map((bucket) => {
		const realized = bucket.realizedIncome - bucket.realizedExpense;
		const planned =
			bucket.plannedIncome - bucket.plannedExpense - bucket.invoiceOutflow;
		const openingCents = running;
		const deltaCents = planned;
		running += deltaCents;
		return {
			bucketKey: bucket.key,
			bucketStart: bucket.start,
			bucketEnd: bucket.end,
			openingCents,
			deltaCents,
			closingCents: running,
			planned,
			realized,
		};
	});
}

export function negativeBalanceAlerts(
	projections: ReturnType<typeof projectAccountBalances>,
) {
	return projections
		.filter((projection) => projection.minCents < 0)
		.map((projection) => ({
			accountId: projection.accountId,
			accountName: projection.accountName,
			minCents: projection.minCents,
			minDate: projection.minDate,
		}));
}

export function comparePlannedVsRealized(buckets: CashFlowBucket[]) {
	return buckets.map((bucket) => {
		const plannedCents =
			bucket.plannedIncome - bucket.plannedExpense - bucket.invoiceOutflow;
		const realizedCents = bucket.realizedIncome - bucket.realizedExpense;
		const deltaCents = realizedCents - plannedCents;
		return {
			key: bucket.key,
			plannedCents,
			realizedCents,
			deltaCents,
			deltaPercent:
				plannedCents === 0 ? null : deltaCents / Math.abs(plannedCents),
		};
	});
}

export function pendingReviewSummary(
	transactions: CashFlowTransaction[],
	rows: ImportRowForPending[],
) {
	const pendingTransactions = transactions.filter(
		(transaction) =>
			!transaction.isArchived && transaction.status === "pending_review",
	);
	const pendingImportRows = rows.filter(
		(row) =>
			row.status !== "ignored" &&
			row.status !== "duplicate" &&
			row.status !== "imported",
	);
	return {
		transactionCount: pendingTransactions.length,
		importRowCount: pendingImportRows.length,
		transactions: pendingTransactions,
		importRows: pendingImportRows,
	};
}

function addTransaction(
	bucket: CashFlowBucket,
	transaction: CashFlowTransaction,
	kind: "planned" | "realized",
) {
	addMovement(bucket, transaction, kind);
}

function addMovement(
	bucket: CashFlowBucket,
	movement: Pick<PlannedMovement, "movementType" | "amountCents">,
	kind: "planned" | "realized",
) {
	if (movement.movementType === "income")
		bucket[`${kind}Income`] += movement.amountCents;
	if (
		movement.movementType === "expense" ||
		movement.movementType === "credit_card_payment"
	)
		bucket[`${kind}Expense`] += movement.amountCents;
}

function movementDelta(
	movement: Pick<PlannedMovement, "movementType" | "amountCents">,
) {
	if (
		movement.movementType === "income" ||
		movement.movementType === "balance_adjustment"
	)
		return movement.amountCents;
	if (
		movement.movementType === "expense" ||
		movement.movementType === "transfer" ||
		movement.movementType === "credit_card_payment"
	)
		return -movement.amountCents;
	return 0;
}

function plannedMovementsForDay(
	accountId: number,
	day: string,
	transactions: CashFlowTransaction[],
	extra: PlannedMovement[] = [],
) {
	const fromTransactions = transactions.filter(
		(transaction) =>
			!transaction.isArchived &&
			transaction.status === "planned" &&
			transaction.accountId === accountId &&
			transaction.occurredOn === day,
	);
	const fromExtra = extra.filter(
		(movement) =>
			movement.accountId === accountId && movement.occurredOn === day,
	);
	return [...fromTransactions, ...fromExtra];
}

function matchesAccountFilter(
	transaction: CashFlowTransaction,
	filter: AccountFilter,
) {
	return (
		filter === "all" ||
		transaction.accountId === filter ||
		transaction.destinationAccountId === filter
	);
}

function inWindow(date: string, window: CashFlowWindow) {
	return date >= window.start && date <= window.end;
}

function bucketStart(date: Date, granularity: Granularity) {
	if (granularity === "day") return date;
	if (granularity === "week") return startOfIsoWeek(date);
	if (granularity === "month")
		return new Date(date.getFullYear(), date.getMonth(), 1);
	return new Date(date.getFullYear(), 0, 1);
}

function bucketEnd(date: Date, granularity: Granularity) {
	if (granularity === "day") return date;
	if (granularity === "week") return addDays(startOfIsoWeek(date), 6);
	if (granularity === "month")
		return new Date(date.getFullYear(), date.getMonth() + 1, 0);
	return new Date(date.getFullYear(), 11, 31);
}

function labelForBucket(dateIso: string, granularity: Granularity) {
	if (granularity === "day") return dateIso;
	if (granularity === "week") return `Semana de ${dateIso}`;
	if (granularity === "month") return dateIso.slice(0, 7);
	return dateIso.slice(0, 4);
}

function dateRange(start: string, end: string) {
	const days: string[] = [];
	let cursor = parseDate(start);
	const final = parseDate(end);
	while (cursor <= final) {
		days.push(formatDate(cursor));
		cursor = addDays(cursor, 1);
	}
	return days;
}

function parseDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfIsoWeek(date: Date) {
	const day = date.getDay() || 7;
	return addDays(date, 1 - day);
}

function isoWeekNumber(date: Date) {
	const target = new Date(date.valueOf());
	const day = (target.getDay() + 6) % 7;
	target.setDate(target.getDate() - day + 3);
	const firstThursday = new Date(target.getFullYear(), 0, 4);
	return (
		1 +
		Math.round(
			((target.valueOf() - firstThursday.valueOf()) / 86400000 -
				3 +
				((firstThursday.getDay() + 6) % 7)) /
				7,
		)
	);
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addDaysIso(dateIso: string, days: number) {
	return formatDate(addDays(parseDate(dateIso), days));
}

function addMonthsIso(dateIso: string, months: number) {
	const date = parseDate(dateIso);
	return formatDate(
		new Date(date.getFullYear(), date.getMonth() + months, date.getDate()),
	);
}

function addYearsIso(dateIso: string, years: number) {
	const date = parseDate(dateIso);
	return formatDate(
		new Date(date.getFullYear() + years, date.getMonth(), date.getDate()),
	);
}

function minDate(left: Date, right: Date) {
	return left < right ? left : right;
}

function maxDate(left: Date, right: Date) {
	return left > right ? left : right;
}
