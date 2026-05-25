export type MonthlyBudgetScope = "month" | "category_group" | "category";

type BudgetScopeSelection = {
	categoryGroupId: number | null;
	categoryId: number | null;
};

export function normalizeBudgetScopeSelection(
	scope: MonthlyBudgetScope,
	selection: BudgetScopeSelection,
): BudgetScopeSelection {
	if (scope === "month") {
		return { categoryGroupId: null, categoryId: null };
	}
	if (scope === "category_group") {
		return {
			categoryGroupId: selection.categoryGroupId,
			categoryId: null,
		};
	}
	return {
		categoryGroupId: null,
		categoryId: selection.categoryId,
	};
}
