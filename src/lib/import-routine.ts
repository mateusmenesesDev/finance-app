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
