// Pure helpers used by the import confirmation server action and its review UI.
// Kept dependency-free so they can be unit-tested without a database.

export type ImportMovementType =
	| "income"
	| "expense"
	| "transfer"
	| "credit_card_payment";

export type ImportConfirmCategory = {
	id: number;
	name: string;
	kind: ImportMovementType;
};

export type ResolveCategoryInput = {
	movementType: ImportMovementType;
	rowCategoryId: number | null;
	bulkCategoryId: number | null;
	categoriesById: Map<number, ImportConfirmCategory>;
};

export type ResolveCategoryResult =
	| { kind: "ok"; category: ImportConfirmCategory; usedBulk: boolean }
	| { kind: "missing" }
	| {
			kind: "mismatch";
			category: ImportConfirmCategory;
			source: "row" | "bulk";
	  };

// Mirrors the server action's resolution: the row-level pick wins, otherwise
// the bulk default may fill in, but bulk only applies when its kind matches
// the row's movement type. Transfers and invoice payments are category-free.
export function resolveConfirmRowCategory(
	input: ResolveCategoryInput,
): ResolveCategoryResult {
	const { movementType, rowCategoryId, bulkCategoryId, categoriesById } = input;
	if (movementType === "transfer")
		return {
			kind: "ok",
			category: { id: 0, name: "Transferência", kind: "transfer" },
			usedBulk: false,
		};
	if (movementType === "credit_card_payment")
		return {
			kind: "ok",
			category: {
				id: 0,
				name: "Pagamento de fatura",
				kind: "credit_card_payment",
			},
			usedBulk: false,
		};
	if (rowCategoryId !== null) {
		const category = categoriesById.get(rowCategoryId);
		if (!category) return { kind: "missing" };
		if (category.kind !== movementType)
			return { kind: "mismatch", category, source: "row" };
		return { kind: "ok", category, usedBulk: false };
	}
	if (bulkCategoryId !== null) {
		const bulk = categoriesById.get(bulkCategoryId);
		if (!bulk) return { kind: "missing" };
		if (bulk.kind !== movementType)
			return { kind: "mismatch", category: bulk, source: "bulk" };
		return { kind: "ok", category: bulk, usedBulk: true };
	}
	return { kind: "missing" };
}

const movementTypeLabel: Record<ImportMovementType, string> = {
	income: "receita",
	expense: "despesa",
	transfer: "transferência",
	credit_card_payment: "pagamento de fatura",
};

export function formatConfirmCategoryError(
	result: Exclude<ResolveCategoryResult, { kind: "ok" }>,
	movementType: ImportMovementType,
): string {
	const rowLabel = movementTypeLabel[movementType];
	if (result.kind === "missing") {
		return `Selecione uma categoria de ${rowLabel} para esta linha.`;
	}
	const categoryLabel = movementTypeLabel[result.category.kind];
	if (result.source === "bulk") {
		return `A categoria do lote (“${result.category.name}”) é de ${categoryLabel}, mas esta linha está marcada como ${rowLabel}. Escolha uma categoria de ${rowLabel} aqui ou troque o lote.`;
	}
	return `A categoria “${result.category.name}” é de ${categoryLabel}, incompatível com o tipo ${rowLabel} desta linha.`;
}
