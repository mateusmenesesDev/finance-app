import {
	affectsReports,
	calculateMonthlyTotalsByCashFlowRole,
	getMonthPeriod,
	isInPeriod,
	type MonthPeriod,
	type RuleAccount,
	type RuleCategory,
	type RuleCategoryGroup,
	type RuleTransaction,
	rankMonthlyCategories,
	rankMonthlyGroups,
} from "~/lib/finance-rules";
import { type RecurrenceInput, rankFixedExpenses } from "~/lib/recurrences";

export type AnalysisTransaction = RuleTransaction & {
	description?: string | null;
	originalDescription?: string | null;
};

export type NamedAccount = RuleAccount & { name: string };

export type Comparison = { deltaCents: number; percent: number | null };
export type MonthlyTotalsPoint = {
	monthKey: string;
	mainIncomeCents: number;
	financialIncomeCents: number;
	incomeCents: number;
	expenseCents: number;
	netCents: number;
};
export type MonthlyAmountPoint = {
	monthKey: string;
	amountCents: number;
	transactionCount: number;
};
export type CategoryInsight = {
	categoryId: number;
	categoryName: string;
	groupName: string;
	currentCents: number;
	baselineCents: number;
	deltaCents: number;
	percent: number;
};
export type SavingOpportunity = {
	key: string;
	label: string;
	amountCents: number;
	sources: ("subscription" | "grower" | "small_recurring")[];
};

const MIN_BASELINE_CENTS = 5000;

export function buildMonthWindow(
	period: MonthPeriod,
	monthsBack: number,
): MonthPeriod[] {
	if (monthsBack <= 0) return [];
	return Array.from({ length: monthsBack }, (_, index) =>
		shiftMonthPeriod(period, index - monthsBack + 1),
	);
}

export function previousMonthPeriod(period: MonthPeriod) {
	return shiftMonthPeriod(period, -1);
}

export function sameMonthLastYear(period: MonthPeriod) {
	return shiftMonthPeriod(period, -12);
}

export function normalizeDescription(text: string) {
	return text.toLowerCase().trim().replace(/\s+/g, " ");
}

export function rankAccountsByExpense(
	transactions: RuleTransaction[],
	accounts: NamedAccount[],
	period: MonthPeriod,
	limit = 10,
) {
	const accountNames = new Map(
		accounts.map((account) => [account.id, account.name]),
	);
	const rows = new Map<
		number,
		{
			accountId: number;
			accountName: string;
			amountCents: number;
			transactionCount: number;
		}
	>();
	for (const transaction of transactions) {
		if (!isConfirmedExpenseInPeriod(transaction, period)) continue;
		const row = rows.get(transaction.accountId) ?? {
			accountId: transaction.accountId,
			accountName: accountNames.get(transaction.accountId) ?? "Conta removida",
			amountCents: 0,
			transactionCount: 0,
		};
		row.amountCents += transaction.amountCents;
		row.transactionCount++;
		rows.set(transaction.accountId, row);
	}
	return [...rows.values()]
		.sort(byAmountThenName("accountName"))
		.slice(0, limit);
}

export function rankDescriptions(
	transactions: AnalysisTransaction[],
	period: MonthPeriod,
	limit = 10,
) {
	const rows = new Map<
		string,
		{
			key: string;
			label: string;
			amountCents: number;
			transactionCount: number;
			labels: Map<string, number>;
		}
	>();
	for (const transaction of transactions) {
		if (!isConfirmedExpenseInPeriod(transaction, period)) continue;
		const raw =
			transaction.description ??
			transaction.originalDescription ??
			"Sem descrição";
		const key = normalizeDescription(raw);
		if (!key) continue;
		const label = raw.trim();
		const row = rows.get(key) ?? {
			key,
			label,
			amountCents: 0,
			transactionCount: 0,
			labels: new Map(),
		};
		row.amountCents += transaction.amountCents;
		row.transactionCount++;
		row.labels.set(label, (row.labels.get(label) ?? 0) + 1);
		row.label =
			[...row.labels.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
			)[0]?.[0] ?? label;
		rows.set(key, row);
	}
	return [...rows.values()]
		.map(({ labels: _labels, ...row }) => row)
		.sort(byAmountThenName("key"))
		.slice(0, limit);
}

export function rankLargestExpenses(
	transactions: AnalysisTransaction[],
	accounts: NamedAccount[],
	categories: RuleCategory[],
	period: MonthPeriod,
	limit = 10,
) {
	const accountNames = new Map(
		accounts.map((account) => [account.id, account.name]),
	);
	const categoryNames = new Map(
		categories.map((category) => [category.id, category.name]),
	);
	return transactions
		.filter((transaction) => isConfirmedExpenseInPeriod(transaction, period))
		.map((transaction) => ({
			date: transaction.occurredOn,
			description:
				transaction.description ??
				transaction.originalDescription ??
				"Sem descrição",
			amountCents: transaction.amountCents,
			accountName: accountNames.get(transaction.accountId) ?? "Conta removida",
			categoryName: transaction.categoryId
				? (categoryNames.get(transaction.categoryId) ?? "Categoria removida")
				: "Sem categoria",
		}))
		.sort(
			(left, right) =>
				right.amountCents - left.amountCents ||
				left.description.localeCompare(right.description) ||
				left.date.localeCompare(right.date),
		)
		.slice(0, limit);
}

export function rankSubscriptions(recurrences: RecurrenceInput[], limit = 10) {
	return rankFixedExpenses(recurrences)
		.filter((recurrence) => recurrence.isSubscription)
		.sort(
			(left, right) =>
				right.monthlyAmountCents - left.monthlyAmountCents ||
				left.name.localeCompare(right.name),
		)
		.slice(0, limit);
}

export function monthlyTotalsSeries(
	transactions: RuleTransaction[],
	window: MonthPeriod[],
	categories: RuleCategory[] = [],
	groups: RuleCategoryGroup[] = [],
): MonthlyTotalsPoint[] {
	return window.map((period) => {
		const totals = calculateMonthlyTotalsByCashFlowRole(
			transactions,
			categories,
			groups,
			period,
		);
		return {
			monthKey: period.key,
			mainIncomeCents: totals.mainIncomeCents,
			financialIncomeCents: totals.financialIncomeCents,
			incomeCents: totals.incomeCents,
			expenseCents: totals.expenseCents,
			netCents: totals.netCents,
		};
	});
}

export function topCategoryIdsForPeriod(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
	limit = 5,
) {
	return rankMonthlyCategories(
		transactions,
		categories,
		groups,
		period,
		"expense",
		limit,
	)
		.map((row) => row.categoryId)
		.filter((id): id is number => id !== null);
}

export function topGroupIdsForPeriod(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
	limit = 5,
) {
	return rankMonthlyGroups(
		transactions,
		categories,
		groups,
		period,
		"expense",
		limit,
	)
		.map((row) => row.groupId)
		.filter((id): id is number => id !== null);
}

export function categoryMonthlySeries(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	_groups: RuleCategoryGroup[],
	window: MonthPeriod[],
	topCategoryIds: number[],
) {
	const names = new Map(
		categories.map((category) => [category.id, category.name]),
	);
	return topCategoryIds.map((categoryId) => ({
		categoryId,
		categoryName: names.get(categoryId) ?? "Categoria removida",
		series: window.map((period) =>
			sumCategory(transactions, period, categoryId),
		),
	}));
}

export function groupMonthlySeries(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	window: MonthPeriod[],
	topGroupIds: number[],
) {
	const groupNames = new Map(groups.map((group) => [group.id, group.name]));
	const categoryGroups = new Map(
		categories.map((category) => [category.id, category.groupId]),
	);
	return topGroupIds.map((groupId) => ({
		groupId,
		groupName: groupNames.get(groupId) ?? "Grupo removido",
		series: window.map((period) =>
			sumGroup(transactions, period, groupId, categoryGroups),
		),
	}));
}

export function compareToReference(
	currentCents: number,
	referenceCents: number,
): Comparison {
	return {
		deltaCents: currentCents - referenceCents,
		percent:
			referenceCents === 0
				? null
				: (currentCents - referenceCents) / referenceCents,
	};
}

export function buildComparisons(
	series: { monthKey: string; amountCents: number }[],
	period: MonthPeriod,
) {
	const index = series.findIndex((point) => point.monthKey === period.key);
	if (index < 0)
		return {
			previousMonth: null,
			priorFiveAverage: null,
			sameMonthLastYear: null,
		};
	const current = series[index]?.amountCents ?? 0;
	const previous = series[index - 1];
	const priorFive = series.slice(Math.max(0, index - 5), index);
	const yoy = series.find(
		(point) => point.monthKey === sameMonthLastYear(period).key,
	);
	return {
		previousMonth: previous
			? compareToReference(current, previous.amountCents)
			: null,
		priorFiveAverage:
			priorFive.length === 5
				? compareToReference(
						current,
						Math.round(
							priorFive.reduce((sum, point) => sum + point.amountCents, 0) / 5,
						),
					)
				: null,
		sameMonthLastYear: yoy
			? compareToReference(current, yoy.amountCents)
			: null,
	};
}

export function topCategoryGrowers(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
	options: { limit?: number } = {},
) {
	return categoryDeltas(transactions, categories, groups, period)
		.filter((row) => row.deltaCents > 0)
		.sort(
			(left, right) =>
				right.percent - left.percent ||
				left.categoryName.localeCompare(right.categoryName),
		)
		.slice(0, options.limit ?? 5);
}

export function topCategoryReducers(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
	options: { limit?: number } = {},
) {
	return categoryDeltas(transactions, categories, groups, period)
		.filter((row) => row.deltaCents < 0)
		.sort(
			(left, right) =>
				left.percent - right.percent ||
				left.categoryName.localeCompare(right.categoryName),
		)
		.slice(0, options.limit ?? 5);
}

export function categoryAnomalies(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
	monthsBack = 6,
) {
	const groupNames = groupNameByCategory(categories, groups);
	return categories
		.map((category) => {
			const current = sumCategory(
				transactions,
				period,
				category.id,
			).amountCents;
			const values = buildMonthWindow(previousMonthPeriod(period), monthsBack)
				.map(
					(month) => sumCategory(transactions, month, category.id).amountCents,
				)
				.filter((amount) => amount > 0);
			if (values.length < 3) return null;
			const mean = average(values);
			const stddev = Math.sqrt(
				average(values.map((value) => (value - mean) ** 2)),
			);
			const threshold = mean + 2 * stddev;
			if (current <= threshold) return null;
			return {
				categoryId: category.id,
				categoryName: category.name,
				groupName: groupNames.get(category.id) ?? "Sem grupo",
				currentCents: current,
				meanCents: Math.round(mean),
				stddevCents: Math.round(stddev),
				thresholdCents: Math.round(threshold),
			};
		})
		.filter((row) => row !== null)
		.sort(
			(left, right) =>
				right.currentCents - left.currentCents ||
				left.categoryName.localeCompare(right.categoryName),
		);
}

export function concentrationSummary(
	groupRanking: { amountCents: number }[],
	totalExpenseCents: number,
) {
	const topGroupShare =
		totalExpenseCents > 0
			? (groupRanking[0]?.amountCents ?? 0) / totalExpenseCents
			: 0;
	const topThreeShare =
		totalExpenseCents > 0
			? groupRanking
					.slice(0, 3)
					.reduce((sum, row) => sum + row.amountCents, 0) / totalExpenseCents
			: 0;
	const reason =
		topGroupShare > 0.4 ? "top1" : topThreeShare > 0.7 ? "top3" : null;
	return {
		topGroupShare,
		topThreeShare,
		isConcentrated: reason !== null,
		reason,
	};
}

export function smallRecurringDescriptions(
	transactions: AnalysisTransaction[],
	window: MonthPeriod[],
) {
	const rows = new Map<
		string,
		{
			key: string;
			label: string;
			totalCents: number;
			occurrenceCount: number;
			averageCents: number;
			maxCents: number;
			labels: Map<string, number>;
		}
	>();
	for (const transaction of transactions) {
		if (!affectsReports(transaction) || transaction.movementType !== "expense")
			continue;
		if (!window.some((period) => isInPeriod(transaction, period))) continue;
		const raw =
			transaction.description ??
			transaction.originalDescription ??
			"Sem descrição";
		const key = normalizeDescription(raw);
		if (!key) continue;
		const label = raw.trim();
		const row = rows.get(key) ?? {
			key,
			label,
			totalCents: 0,
			occurrenceCount: 0,
			averageCents: 0,
			maxCents: 0,
			labels: new Map(),
		};
		row.totalCents += transaction.amountCents;
		row.occurrenceCount++;
		row.maxCents = Math.max(row.maxCents, transaction.amountCents);
		row.labels.set(label, (row.labels.get(label) ?? 0) + 1);
		row.label =
			[...row.labels.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
			)[0]?.[0] ?? label;
		rows.set(key, row);
	}
	return [...rows.values()]
		.filter(
			(row) =>
				row.occurrenceCount >= 3 &&
				row.maxCents < 5000 &&
				row.totalCents > 20000,
		)
		.map(({ labels: _labels, maxCents: _maxCents, ...row }) => ({
			...row,
			averageCents: Math.round(row.totalCents / row.occurrenceCount),
		}))
		.sort(
			(left, right) =>
				right.totalCents - left.totalCents || left.key.localeCompare(right.key),
		);
}

export function savingOpportunities({
	subscriptionsToReview,
	growers,
	smallRecurring,
}: {
	subscriptionsToReview: {
		recurrenceId: number;
		name?: string;
		monthlyAmountCents: number;
	}[];
	growers: CategoryInsight[];
	smallRecurring: { key: string; label: string; totalCents: number }[];
}): SavingOpportunity[] {
	const rows = new Map<string, SavingOpportunity>();
	for (const subscription of subscriptionsToReview) {
		addOpportunity(
			rows,
			`subscription:${subscription.recurrenceId}`,
			subscription.name ?? `Assinatura ${subscription.recurrenceId}`,
			subscription.monthlyAmountCents,
			"subscription",
		);
	}
	for (const grower of growers) {
		addOpportunity(
			rows,
			`category:${grower.categoryId}`,
			grower.categoryName,
			grower.deltaCents,
			"grower",
		);
	}
	for (const recurring of smallRecurring) {
		addOpportunity(
			rows,
			`description:${recurring.key}`,
			recurring.label,
			recurring.totalCents,
			"small_recurring",
		);
	}
	return [...rows.values()].sort(
		(left, right) =>
			right.amountCents - left.amountCents ||
			left.label.localeCompare(right.label),
	);
}

export function uncategorizedExpenseStats(
	transactions: RuleTransaction[],
	period: MonthPeriod,
) {
	return transactions.reduce(
		(stats, transaction) => {
			if (
				isConfirmedExpenseInPeriod(transaction, period) &&
				!transaction.categoryId
			) {
				stats.count++;
				stats.amountCents += transaction.amountCents;
			}
			return stats;
		},
		{ count: 0, amountCents: 0 },
	);
}

function shiftMonthPeriod(period: MonthPeriod, monthOffset: number) {
	const [year = 0, month = 1] = period.key.split("-").map(Number);
	return getMonthPeriod(new Date(year, month - 1 + monthOffset, 1));
}

function isConfirmedExpenseInPeriod(
	transaction: RuleTransaction,
	period: MonthPeriod,
) {
	return (
		affectsReports(transaction) &&
		transaction.movementType === "expense" &&
		isInPeriod(transaction, period)
	);
}

function byAmountThenName<T extends { amountCents: number }>(nameKey: keyof T) {
	return (left: T, right: T) =>
		right.amountCents - left.amountCents ||
		String(left[nameKey]).localeCompare(String(right[nameKey]));
}

function sumCategory(
	transactions: RuleTransaction[],
	period: MonthPeriod,
	categoryId: number,
): MonthlyAmountPoint {
	let amountCents = 0;
	let transactionCount = 0;
	for (const transaction of transactions) {
		if (
			isConfirmedExpenseInPeriod(transaction, period) &&
			transaction.categoryId === categoryId
		) {
			amountCents += transaction.amountCents;
			transactionCount++;
		}
	}
	return { monthKey: period.key, amountCents, transactionCount };
}

function sumGroup(
	transactions: RuleTransaction[],
	period: MonthPeriod,
	groupId: number,
	categoryGroups: Map<number, number>,
): MonthlyAmountPoint {
	let amountCents = 0;
	let transactionCount = 0;
	for (const transaction of transactions) {
		if (
			isConfirmedExpenseInPeriod(transaction, period) &&
			transaction.categoryId &&
			categoryGroups.get(transaction.categoryId) === groupId
		) {
			amountCents += transaction.amountCents;
			transactionCount++;
		}
	}
	return { monthKey: period.key, amountCents, transactionCount };
}

function categoryDeltas(
	transactions: RuleTransaction[],
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
	period: MonthPeriod,
): CategoryInsight[] {
	const groupNames = groupNameByCategory(categories, groups);
	const prior = buildMonthWindow(previousMonthPeriod(period), 5);
	return categories
		.map((category) => {
			const currentCents = sumCategory(
				transactions,
				period,
				category.id,
			).amountCents;
			const baselineCents = Math.round(
				average(
					prior.map(
						(month) =>
							sumCategory(transactions, month, category.id).amountCents,
					),
				),
			);
			if (baselineCents < MIN_BASELINE_CENTS) return null;
			const deltaCents = currentCents - baselineCents;
			return {
				categoryId: category.id,
				categoryName: category.name,
				groupName: groupNames.get(category.id) ?? "Sem grupo",
				currentCents,
				baselineCents,
				deltaCents,
				percent: deltaCents / baselineCents,
			};
		})
		.filter((row) => row !== null);
}

function groupNameByCategory(
	categories: RuleCategory[],
	groups: RuleCategoryGroup[],
) {
	const groupsById = new Map(groups.map((group) => [group.id, group.name]));
	return new Map(
		categories.map((category) => [
			category.id,
			groupsById.get(category.groupId) ?? "Sem grupo",
		]),
	);
}

function average(values: number[]) {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addOpportunity(
	rows: Map<string, SavingOpportunity>,
	key: string,
	label: string,
	amountCents: number,
	source: SavingOpportunity["sources"][number],
) {
	const row = rows.get(key) ?? { key, label, amountCents: 0, sources: [] };
	row.amountCents = Math.max(row.amountCents, amountCents);
	if (!row.sources.includes(source)) row.sources.push(source);
	rows.set(key, row);
}
