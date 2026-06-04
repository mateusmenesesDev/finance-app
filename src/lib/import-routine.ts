import { previousMonthPeriod } from "./analysis";
import { getMonthPeriod, parseMonthPeriod } from "./finance-rules";

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
