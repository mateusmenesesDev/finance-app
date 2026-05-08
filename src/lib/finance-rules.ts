export type MovementType =
	| "income"
	| "expense"
	| "transfer"
	| "credit_card_payment"
	| "balance_adjustment";

export type TransactionStatus =
	| "planned"
	| "confirmed"
	| "ignored"
	| "duplicate"
	| "pending_review";

export type AccountKind =
	| "checking"
	| "savings"
	| "cash"
	| "credit_card"
	| "investment";

export type RuleAccount = {
	id: number;
	type: AccountKind;
	initialBalanceCents: number;
	creditCardClosingDay: number | null;
	creditCardDueDay: number | null;
};

export type RuleTransaction = {
	accountId: number;
	destinationAccountId: number | null;
	movementType: MovementType;
	status: TransactionStatus;
	amountCents: number;
	occurredOn: string;
	isArchived: boolean;
};

const normalAccountTypes = new Set<AccountKind>([
	"checking",
	"savings",
	"cash",
	"investment",
]);

export function affectsReports(transaction: RuleTransaction) {
	return transaction.status === "confirmed" && !transaction.isArchived;
}

export function calculateAccountBalances(
	accounts: RuleAccount[],
	transactions: RuleTransaction[],
) {
	const balances = new Map<
		number,
		{ normalBalanceCents: number; cardDebtCents: number }
	>();
	const accountsById = new Map(
		accounts.map((account) => [account.id, account]),
	);

	for (const account of accounts) {
		balances.set(account.id, {
			normalBalanceCents: normalAccountTypes.has(account.type)
				? account.initialBalanceCents
				: 0,
			cardDebtCents: 0,
		});
	}

	for (const transaction of transactions) {
		if (!affectsReports(transaction)) continue;

		const source = accountsById.get(transaction.accountId);
		const destination = transaction.destinationAccountId
			? accountsById.get(transaction.destinationAccountId)
			: undefined;
		const sourceBalance = balances.get(transaction.accountId);
		const destinationBalance = transaction.destinationAccountId
			? balances.get(transaction.destinationAccountId)
			: undefined;

		if (source && sourceBalance) {
			if (normalAccountTypes.has(source.type)) {
				if (
					transaction.movementType === "income" ||
					transaction.movementType === "balance_adjustment"
				) {
					sourceBalance.normalBalanceCents += transaction.amountCents;
				}
				if (
					transaction.movementType === "expense" ||
					transaction.movementType === "transfer" ||
					transaction.movementType === "credit_card_payment"
				) {
					sourceBalance.normalBalanceCents -= transaction.amountCents;
				}
			} else if (source.type === "credit_card") {
				if (transaction.movementType === "expense") {
					sourceBalance.cardDebtCents += transaction.amountCents;
				}
				if (transaction.movementType === "balance_adjustment") {
					sourceBalance.cardDebtCents += transaction.amountCents;
				}
			}
		}

		if (destination && destinationBalance) {
			if (
				transaction.movementType === "transfer" &&
				normalAccountTypes.has(destination.type)
			) {
				destinationBalance.normalBalanceCents += transaction.amountCents;
			}
			if (
				transaction.movementType === "credit_card_payment" &&
				destination.type === "credit_card"
			) {
				destinationBalance.cardDebtCents -= transaction.amountCents;
			}
		}
	}

	return balances;
}

export function getCurrentMonthPeriod(reference = new Date()) {
	const year = reference.getFullYear();
	const month = reference.getMonth();
	return {
		start: formatDate(new Date(year, month, 1)),
		end: formatDate(new Date(year, month + 1, 0)),
	};
}

export function getInvoiceForDate(
	occurredOn: string,
	closingDay: number,
	dueDay: number,
) {
	const date = parseLocalDate(occurredOn);
	const close = closingDateOnOrAfter(date, closingDay);
	const dueMonthOffset = dueDay > closingDay ? 0 : 1;
	const due = clampDate(
		close.getFullYear(),
		close.getMonth() + dueMonthOffset,
		dueDay,
	);

	return {
		key: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`,
		closingDate: formatDate(close),
		dueDate: formatDate(due),
	};
}

function closingDateOnOrAfter(date: Date, closingDay: number) {
	const sameMonthClose = clampDate(
		date.getFullYear(),
		date.getMonth(),
		closingDay,
	);
	if (date <= sameMonthClose) return sameMonthClose;
	return clampDate(date.getFullYear(), date.getMonth() + 1, closingDay);
}

function clampDate(year: number, month: number, day: number) {
	return new Date(year, month, Math.min(day, daysInMonth(year, month)));
}

function daysInMonth(year: number, month: number) {
	return new Date(year, month + 1, 0).getDate();
}

function parseLocalDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
