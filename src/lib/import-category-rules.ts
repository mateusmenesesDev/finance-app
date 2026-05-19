export type ImportRuleMatchMode = "contains" | "exact";
export type ImportRuleMovementType = "income" | "expense";
export type ImportRuleAction = "categorize" | "ignore";

export type ImportCategoryRule = {
	id: number;
	action: ImportRuleAction;
	categoryId: number | null;
	accountId: number | null;
	movementType: ImportRuleMovementType | string | null;
	normalizedDescription: string;
	textMatchMode: ImportRuleMatchMode;
	amountCents: number | null;
	amountToleranceCents: number | null;
	descriptionOverride: string | null;
	priority: number;
	createdAt: Date;
};

export type ImportRuleRow = {
	accountId: number;
	movementType: ImportRuleMovementType | string | null;
	normalizedDescription: string | null;
	amountCents: number | null;
};

export const defaultImportRuleAmountToleranceCents = 100;

export function matchImportCategoryRule(
	row: ImportRuleRow,
	rules: ImportCategoryRule[],
) {
	const matches = rules.filter((rule) => ruleMatchesRow(rule, row));
	matches.sort(compareRules);
	return matches[0] ?? null;
}

export function ruleMatchesRow(rule: ImportCategoryRule, row: ImportRuleRow) {
	if (rule.movementType !== null && row.movementType !== rule.movementType)
		return false;
	const description = row.normalizedDescription ?? "";
	if (!description) return false;
	if (rule.textMatchMode === "exact") {
		if (description !== rule.normalizedDescription) return false;
	} else if (!description.includes(rule.normalizedDescription)) return false;

	if (rule.accountId !== null && row.accountId !== rule.accountId) return false;
	if (rule.amountCents !== null) {
		if (row.amountCents === null) return false;
		const tolerance =
			rule.amountToleranceCents ?? defaultImportRuleAmountToleranceCents;
		if (Math.abs(row.amountCents - rule.amountCents) > tolerance) return false;
	}
	return true;
}

// Ignore wins over categorize so users get a definitive "skip" signal even
// when a competing categorize rule also matches.
function compareRules(a: ImportCategoryRule, b: ImportCategoryRule) {
	if (a.action !== b.action) return a.action === "ignore" ? -1 : 1;
	const specificity = ruleSpecificity(b) - ruleSpecificity(a);
	if (specificity !== 0) return specificity;
	const priority = b.priority - a.priority;
	if (priority !== 0) return priority;
	return b.createdAt.getTime() - a.createdAt.getTime();
}

function ruleSpecificity(rule: ImportCategoryRule) {
	return (
		(rule.textMatchMode === "exact" ? 100 : 0) +
		rule.normalizedDescription.length +
		(rule.movementType === null ? 0 : 10) +
		(rule.accountId === null ? 0 : 20) +
		(rule.amountCents === null ? 0 : 20)
	);
}
