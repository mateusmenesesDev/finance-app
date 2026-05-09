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
	categoryId?: number | null;
	movementType: MovementType;
	status: TransactionStatus;
	amountCents: number;
	occurredOn: string;
	isArchived: boolean;
};

export type RuleCategory = {
	id: number;
	groupId: number;
	name: string;
};

export type RuleCategoryGroup = {
	id: number;
	name: string;
};

export type BudgetScope = "month" | "category_group" | "category";
export type BudgetStatus = "ok" | "near" | "over";

export type RuleBudget = {
	id: number;
	monthKey: string;
	scope: BudgetScope;
	categoryGroupId: number | null;
	categoryId: number | null;
	amountCents: number;
};

export type MonthPeriod = {
	key: string;
	start: string;
	end: string;
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

export function getMonthPeriod(reference = new Date()): MonthPeriod {
	const year = reference.getFullYear();
	const month = reference.getMonth();
	const key = `${year}-${String(month + 1).padStart(2, "0")}`;
	return {
		key,
		start: formatDate(new Date(year, month, 1)),
		end: formatDate(new Date(year, month + 1, 0)),
	};
}

export function parseMonthPeriod(monthKey: string): MonthPeriod | null {
	const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;

	return {
		key: monthKey,
		start: formatDate(new Date(year, month - 1, 1)),
		end: formatDate(new Date(year, month, 0)),
	};
}

export function getCurrentMonthPeriod(reference = new Date()) {
	const period = getMonthPeriod(reference);
	return {
		start: period.start,
		end: period.end,
	};
}

export function calculateMonthlyTotals(
	transactions: RuleTransaction[],
	period: Pick<MonthPeriod, "start" | "end">,
) {
	let incomeCents = 0;
	let expenseCents = 0;
	let transactionCount = 0;

	for (const transaction of transactions) {
		if (!isMonthlyMetricTransaction(transaction, period)) continue;

		transactionCount++;
		if (transaction.movementType === "income") {
			incomeCents += transaction.amountCents;
		} else {
			expenseCents += transaction.amountCents;
		}
	}

	return {
		incomeCents,
		expenseCents,
		netCents: incomeCents - expenseCents,
		transactionCount,
	};
}

export function rankMonthlyCategories(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: Pick<MonthPeriod, "start" | "end">,
	movementType: "income" | "expense" = "expense",
	limit = 5,
) {
	const categoriesById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const groupsById = new Map(groups.map((group) => [group.id, group]));
	const rows = new Map<
		number | null,
		{
			categoryId: number | null;
			categoryName: string;
			groupId: number | null;
			groupName: string;
			amountCents: number;
			transactionCount: number;
		}
	>();

	for (const transaction of transactions) {
		if (!isMonthlyMetricTransaction(transaction, period)) continue;
		if (transaction.movementType !== movementType) continue;

		const category = transaction.categoryId
			? categoriesById.get(transaction.categoryId)
			: undefined;
		const group = category ? groupsById.get(category.groupId) : undefined;
		const key = category?.id ?? null;
		const row = rows.get(key) ?? {
			categoryId: category?.id ?? null,
			categoryName: category?.name ?? "Sem categoria",
			groupId: category?.groupId ?? null,
			groupName: group?.name ?? "Sem grupo",
			amountCents: 0,
			transactionCount: 0,
		};

		row.amountCents += transaction.amountCents;
		row.transactionCount++;
		rows.set(key, row);
	}

	return [...rows.values()]
		.sort((left, right) => {
			const amountDelta = right.amountCents - left.amountCents;
			if (amountDelta !== 0) return amountDelta;
			return left.categoryName.localeCompare(right.categoryName);
		})
		.slice(0, limit);
}

export function rankMonthlyGroups(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: Pick<MonthPeriod, "start" | "end">,
	movementType: "income" | "expense" = "expense",
	limit = 5,
) {
	const categoriesById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const groupsById = new Map(groups.map((group) => [group.id, group]));
	const rows = new Map<
		number | null,
		{
			groupId: number | null;
			groupName: string;
			amountCents: number;
			transactionCount: number;
		}
	>();

	for (const transaction of transactions) {
		if (!isMonthlyMetricTransaction(transaction, period)) continue;
		if (transaction.movementType !== movementType) continue;

		const category = transaction.categoryId
			? categoriesById.get(transaction.categoryId)
			: undefined;
		const group = category ? groupsById.get(category.groupId) : undefined;
		const key = group?.id ?? null;
		const row = rows.get(key) ?? {
			groupId: group?.id ?? null,
			groupName: group?.name ?? "Sem grupo",
			amountCents: 0,
			transactionCount: 0,
		};

		row.amountCents += transaction.amountCents;
		row.transactionCount++;
		rows.set(key, row);
	}

	return [...rows.values()]
		.sort((left, right) => {
			const amountDelta = right.amountCents - left.amountCents;
			if (amountDelta !== 0) return amountDelta;
			return left.groupName.localeCompare(right.groupName);
		})
		.slice(0, limit);
}

export function calculateProjectedCashFlow(
	transactions: RuleTransaction[],
	period: Pick<MonthPeriod, "start" | "end">,
	openingBalanceCents = 0,
) {
	let plannedIncomeCents = 0;
	let plannedExpenseCents = 0;

	for (const transaction of transactions) {
		if (!isInPeriod(transaction, period)) continue;
		if (transaction.isArchived || transaction.status !== "planned") continue;

		if (transaction.movementType === "income") {
			plannedIncomeCents += transaction.amountCents;
		}
		if (transaction.movementType === "expense") {
			plannedExpenseCents += transaction.amountCents;
		}
	}

	return {
		openingBalanceCents,
		plannedIncomeCents,
		plannedExpenseCents,
		projectedBalanceCents:
			openingBalanceCents + plannedIncomeCents - plannedExpenseCents,
	};
}

function isMonthlyMetricTransaction(
	transaction: RuleTransaction,
	period: Pick<MonthPeriod, "start" | "end">,
) {
	return (
		affectsReports(transaction) &&
		(transaction.movementType === "income" ||
			transaction.movementType === "expense") &&
		isInPeriod(transaction, period)
	);
}

export function isInPeriod(
	transaction: RuleTransaction,
	period: Pick<MonthPeriod, "start" | "end">,
) {
	return (
		transaction.occurredOn >= period.start &&
		transaction.occurredOn <= period.end
	);
}

export function classifyBudgetStatus(
	spentCents: number,
	plannedCents: number,
): BudgetStatus {
	const percent = spentCents / plannedCents;
	if (percent >= 1) return "over";
	if (percent >= 0.8) return "near";
	return "ok";
}

export function buildBudgetUsage(
	budgets: RuleBudget[],
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: Pick<MonthPeriod, "start" | "end">,
) {
	const categoriesById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const groupsById = new Map(groups.map((group) => [group.id, group]));
	const expenseTransactions = transactions.filter(
		(transaction) =>
			affectsReports(transaction) &&
			transaction.movementType === "expense" &&
			isInPeriod(transaction, period),
	);
	const allSpentCents = expenseTransactions.reduce(
		(total, transaction) => total + transaction.amountCents,
		0,
	);

	return budgets.map((budget) => {
		let spentCents = allSpentCents;
		let refId: number | null = null;
		let name = "Mês total";

		if (budget.scope === "category_group") {
			refId = budget.categoryGroupId;
			name = refId ? (groupsById.get(refId)?.name ?? "Grupo removido") : name;
			spentCents = expenseTransactions.reduce((total, transaction) => {
				const category = transaction.categoryId
					? categoriesById.get(transaction.categoryId)
					: undefined;
				return category?.groupId === refId
					? total + transaction.amountCents
					: total;
			}, 0);
		}

		if (budget.scope === "category") {
			refId = budget.categoryId;
			name = refId
				? (categoriesById.get(refId)?.name ?? "Categoria removida")
				: name;
			spentCents = expenseTransactions.reduce(
				(total, transaction) =>
					transaction.categoryId === refId
						? total + transaction.amountCents
						: total,
				0,
			);
		}

		const percent = spentCents / budget.amountCents;
		return {
			budgetId: budget.id,
			name,
			percent,
			plannedCents: budget.amountCents,
			refId,
			remainingCents: budget.amountCents - spentCents,
			scope: budget.scope,
			spentCents,
			status: classifyBudgetStatus(spentCents, budget.amountCents),
		};
	});
}

export function buildBudgetHistory(
	budgets: RuleBudget[],
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	monthKeys: string[],
	scope: BudgetScope,
	refId: number | null,
) {
	const orderedKeys = [...monthKeys].sort();
	let previousPlannedCents: number | null = null;
	let previousSpentCents: number | null = null;

	return orderedKeys.map((monthKey) => {
		const period = parseMonthPeriod(monthKey);
		if (!period) throw new Error(`Mês inválido: ${monthKey}`);
		const budget = budgets.find(
			(candidate) =>
				candidate.monthKey === monthKey &&
				candidate.scope === scope &&
				budgetRefId(candidate) === refId,
		);
		const usage = buildBudgetUsage(
			[
				budget ?? {
					amountCents: 1,
					categoryGroupId: scope === "category_group" ? refId : null,
					categoryId: scope === "category" ? refId : null,
					id: 0,
					monthKey,
					scope,
				},
			],
			transactions,
			categories,
			groups,
			period,
		)[0];
		const plannedCents = budget ? budget.amountCents : null;
		const spentCents = usage?.spentCents ?? 0;
		const row = {
			deltaPlannedCents:
				plannedCents === null || previousPlannedCents === null
					? null
					: plannedCents - previousPlannedCents,
			deltaSpentCents:
				spentCents === null || previousSpentCents === null
					? null
					: spentCents - previousSpentCents,
			monthKey,
			percent: budget && usage ? usage.percent : null,
			plannedCents,
			spentCents,
		};
		previousPlannedCents = plannedCents;
		previousSpentCents = spentCents;
		return row;
	});
}

export function summarizeBudgetCoherence(
	budgets: RuleBudget[],
	categories: RuleCategory[],
) {
	const warnings: string[] = [];
	const categoriesById = new Map(
		categories.map((category) => [category.id, category]),
	);
	const budgetsByMonth = new Map<string, RuleBudget[]>();
	for (const budget of budgets) {
		budgetsByMonth.set(budget.monthKey, [
			...(budgetsByMonth.get(budget.monthKey) ?? []),
			budget,
		]);
	}

	for (const [monthKey, monthBudgets] of budgetsByMonth) {
		const groupBudgets = monthBudgets.filter(
			(budget) => budget.scope === "category_group",
		);
		const categoryBudgets = monthBudgets.filter(
			(budget) => budget.scope === "category",
		);
		for (const groupBudget of groupBudgets) {
			const categorySum = categoryBudgets.reduce((total, budget) => {
				const category = budget.categoryId
					? categoriesById.get(budget.categoryId)
					: undefined;
				return category?.groupId === groupBudget.categoryGroupId
					? total + budget.amountCents
					: total;
			}, 0);
			if (categorySum > groupBudget.amountCents) {
				warnings.push(
					`${monthKey}: soma dos orçamentos de categoria supera o orçamento do grupo ${groupBudget.categoryGroupId}.`,
				);
			}
		}

		const monthBudget = monthBudgets.find((budget) => budget.scope === "month");
		if (!monthBudget) continue;
		const scopedSum = groupBudgets.reduce(
			(total, budget) => total + budget.amountCents,
			0,
		);
		const categorySum = categoryBudgets.reduce(
			(total, budget) => total + budget.amountCents,
			0,
		);
		const detailSum = scopedSum > 0 ? scopedSum : categorySum;
		if (detailSum > monthBudget.amountCents) {
			warnings.push(
				`${monthKey}: soma dos orçamentos detalhados supera o orçamento mensal.`,
			);
		}
	}

	return warnings;
}

export function listMonthOptions(
	reference: Date,
	pastMonths = 12,
	futureMonths = 3,
) {
	const options: MonthPeriod[] = [];
	const year = reference.getFullYear();
	const month = reference.getMonth();
	for (let offset = -pastMonths; offset <= futureMonths; offset++) {
		options.push(getMonthPeriod(new Date(year, month + offset, 1)));
	}
	return options;
}

function budgetRefId(budget: RuleBudget) {
	if (budget.scope === "category_group") return budget.categoryGroupId;
	if (budget.scope === "category") return budget.categoryId;
	return null;
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
