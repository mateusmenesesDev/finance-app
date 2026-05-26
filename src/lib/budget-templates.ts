import type { MonthlyBudgetScope } from "./budget-form";

type BudgetTarget = {
	scope: MonthlyBudgetScope;
	categoryGroupId: number | null;
	categoryId: number | null;
};

export type BudgetTemplateLike = BudgetTarget & {
	id: number;
	amountCents: number;
	startsAtMonthKey: string;
	isArchived: boolean;
};

export type BudgetTemplateSkipLike = {
	templateId: number;
	monthKey: string;
};

export type MonthlyBudgetLike = BudgetTarget & {
	monthKey: string;
};

export type MaterializedBudgetInsert = MonthlyBudgetLike & {
	amountCents: number;
	templateId: number;
	userId: string;
};

export function compareMonthKeys(a: string, b: string) {
	return a.localeCompare(b);
}

export function monthKeysBetween(startMonthKey: string, endMonthKey: string) {
	if (compareMonthKeys(startMonthKey, endMonthKey) > 0) return [];
	const [startYear, startMonth] = startMonthKey.split("-").map(Number);
	const [endYear, endMonth] = endMonthKey.split("-").map(Number);
	const cursor = new Date(
		Date.UTC(startYear ?? 0, (startMonth ?? 1) - 1, 1),
	);
	const final = new Date(Date.UTC(endYear ?? 0, (endMonth ?? 1) - 1, 1));
	const monthKeys: string[] = [];
	while (cursor <= final) {
		monthKeys.push(
			`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
		);
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return monthKeys;
}

export function monthKeysForDateRange(range: { from: string; to: string }) {
	return monthKeysBetween(range.from.slice(0, 7), range.to.slice(0, 7));
}

export function buildMaterializedBudgetInserts(input: {
	existingBudgets: MonthlyBudgetLike[];
	monthKeys: string[];
	skips: BudgetTemplateSkipLike[];
	templates: BudgetTemplateLike[];
	userId: string;
}) {
	const existingKeys = new Set(
		input.existingBudgets.map((budget) => materializedBudgetKey(budget)),
	);
	const requestedMonths = [...new Set(input.monthKeys)].sort(compareMonthKeys);
	const skipKeys = new Set(
		input.skips.map((skip) => `${skip.templateId}:${skip.monthKey}`),
	);
	const inserts: MaterializedBudgetInsert[] = [];

	for (const template of input.templates) {
		if (template.isArchived) continue;
		for (const monthKey of requestedMonths) {
			if (compareMonthKeys(monthKey, template.startsAtMonthKey) < 0) continue;
			if (skipKeys.has(`${template.id}:${monthKey}`)) continue;
			const candidate = {
				monthKey,
				scope: template.scope,
				categoryGroupId: template.categoryGroupId,
				categoryId: template.categoryId,
			};
			const key = materializedBudgetKey(candidate);
			if (existingKeys.has(key)) continue;
			existingKeys.add(key);
			inserts.push({
				...candidate,
				amountCents: template.amountCents,
				templateId: template.id,
				userId: input.userId,
			});
		}
	}

	return inserts;
}

function materializedBudgetKey(target: MonthlyBudgetLike) {
	return `${target.monthKey}:${target.scope}:${target.categoryGroupId ?? "all"}:${target.categoryId ?? "all"}`;
}
