export const duplicateCategoryNameMessage =
	"Já existe uma categoria com esse nome neste grupo. Use outro nome ou edite a categoria existente.";

export const duplicateCategoryGroupNameMessage =
	"Já existe um grupo com esse nome para esse tipo. Use outro nome ou edite o grupo existente.";

export type CategoryActionState = {
	error: string | null;
};

const duplicateCategoryNameConstraint =
	"finance_app_categories_user_group_name_idx";
const duplicateCategoryGroupNameConstraint =
	"finance_app_category_groups_user_kind_name_idx";

type DatabaseError = {
	code?: unknown;
	constraint?: unknown;
	constraint_name?: unknown;
};

function isUniqueViolation(error: unknown, constraintName: string) {
	if (!error || typeof error !== "object") return false;
	const candidate = error as DatabaseError;
	return (
		candidate.code === "23505" &&
		(candidate.constraint === constraintName ||
			candidate.constraint_name === constraintName)
	);
}

export function isDuplicateCategoryNameError(error: unknown) {
	return isUniqueViolation(error, duplicateCategoryNameConstraint);
}

export function isDuplicateCategoryGroupNameError(error: unknown) {
	return isUniqueViolation(error, duplicateCategoryGroupNameConstraint);
}

export function categoryActionError(
	error: unknown,
): CategoryActionState | null {
	if (isDuplicateCategoryNameError(error)) {
		return { error: duplicateCategoryNameMessage };
	}
	if (isDuplicateCategoryGroupNameError(error)) {
		return { error: duplicateCategoryGroupNameMessage };
	}
	return null;
}
