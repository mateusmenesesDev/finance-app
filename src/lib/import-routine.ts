import { previousMonthPeriod } from "./analysis";
import { getMonthPeriod, parseMonthPeriod } from "./finance-rules";

type EligibilityResult =
	| { ok: true }
	| { ok: false; message: string };

export function accountImportRoutineEligibility(account: {
	isArchived: boolean;
	type: string;
}): EligibilityResult {
	if (account.isArchived) return { ok: false, message: "Conta arquivada" };
	if (account.type === "credit_card") {
		return {
			ok: false,
			message: "Cartões ficam na rotina pela tela Cartões",
		};
	}
	return { ok: true };
}

export function cardImportRoutineEligibility(card: {
	isArchived: boolean;
	isActive: boolean;
}): EligibilityResult {
	if (card.isArchived) return { ok: false, message: "Cartão arquivado" };
	if (!card.isActive) return { ok: false, message: "Cartão inativo" };
	return { ok: true };
}

export function referenceMonthKey(cycleMonthKey: string): string | null {
	const period = parseMonthPeriod(cycleMonthKey);
	if (!period) return null;
	return previousMonthPeriod(period).key;
}

export function isImportRoutineDayOneHighlight(
	cycleMonthKey: string,
	today = new Date(),
) {
	return (
		getMonthPeriod(today).key === cycleMonthKey && today.getDate() === 1
	);
}

export function shouldCompactImportRoutineBlock(input: {
	isFullyComplete: boolean;
	cycleMonthKey: string;
	today?: Date;
}) {
	if (!input.isFullyComplete) return false;
	const today = input.today ?? new Date();
	return getMonthPeriod(today).key === input.cycleMonthKey;
}

export function shouldShowRoutineBlock(input: {
	activeItemCount: number;
	cycleMonthKey: string;
	today?: Date;
}) {
	if (input.activeItemCount <= 0) return false;

	const today = input.today ?? new Date();
	const currentCycleKey = getMonthPeriod(today).key;
	const comparison = input.cycleMonthKey.localeCompare(currentCycleKey);

	if (comparison < 0) return true;
	if (comparison > 0) return false;
	return true;
}

export type ImportRoutineChecklistRow = {
	routineItemId: number;
	kind: "account_statement" | "card_invoice";
	label: string;
	institution: string | null;
	completed: boolean;
};

type RoutineTarget = {
	name: string;
	institution: string | null;
	isArchived: boolean;
};

export function buildImportRoutineChecklist(
	items: Array<{
		id: number;
		kind: "account_statement" | "card_invoice";
		accountId: number | null;
		cardId: number | null;
	}>,
	accountsById: ReadonlyMap<number, RoutineTarget>,
	cardsById: ReadonlyMap<number, RoutineTarget>,
	completedRoutineItemIds: ReadonlySet<number>,
): ImportRoutineChecklistRow[] {
	const rows = items.flatMap((item): ImportRoutineChecklistRow[] => {
		if (item.kind === "account_statement" && item.accountId !== null) {
			const account = accountsById.get(item.accountId);
			if (!account || account.isArchived) return [];
			return [
				{
					routineItemId: item.id,
					kind: item.kind,
					label: `Extrato — ${account.name}`,
					institution: account.institution,
					completed: completedRoutineItemIds.has(item.id),
				},
			];
		}
		if (item.kind === "card_invoice" && item.cardId !== null) {
			const card = cardsById.get(item.cardId);
			if (!card || card.isArchived) return [];
			return [
				{
					routineItemId: item.id,
					kind: item.kind,
					label: `Fatura — ${card.name}`,
					institution: card.institution,
					completed: completedRoutineItemIds.has(item.id),
				},
			];
		}
		return [];
	});

	return rows.sort((left, right) => {
		if (left.kind !== right.kind) {
			return left.kind === "account_statement" ? -1 : 1;
		}
		return left.label.localeCompare(right.label, "pt-BR");
	});
}

export function routineProgress(
	totalCount: number,
	completedRoutineItemIds: ReadonlySet<number>,
) {
	const completedCount = completedRoutineItemIds.size;
	return {
		completedCount,
		totalCount,
		isFullyComplete: totalCount > 0 && completedCount === totalCount,
	};
}

export function routineProgressFromChecklist(rows: ImportRoutineChecklistRow[]) {
	const completedIds = new Set(
		rows.filter((row) => row.completed).map((row) => row.routineItemId),
	);
	return routineProgress(rows.length, completedIds);
}
