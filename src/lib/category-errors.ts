export const duplicateCategoryNameMessage =
	"Já existe uma categoria com esse nome neste grupo. Use outro nome ou edite a categoria existente.";

export type CategoryActionState = {
	error: string | null;
};

const duplicateCategoryNameConstraint =
	"finance_app_categories_user_group_name_idx";

export function isDuplicateCategoryNameError(error: unknown) {
	if (!error || typeof error !== "object") return false;
	const candidate = error as {
		code?: unknown;
		constraint?: unknown;
		constraint_name?: unknown;
	};
	return (
		candidate.code === "23505" &&
		(candidate.constraint === duplicateCategoryNameConstraint ||
			candidate.constraint_name === duplicateCategoryNameConstraint)
	);
}

export function categoryActionError(
	error: unknown,
): CategoryActionState | null {
	if (!isDuplicateCategoryNameError(error)) return null;
	return { error: duplicateCategoryNameMessage };
}
