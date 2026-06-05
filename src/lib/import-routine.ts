import { previousMonthPeriod } from "./analysis";
import { getInvoiceForDate, getMonthPeriod, parseMonthPeriod } from "./finance-rules";
import { parseMonthKey } from "./month-key";

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
	accountId: number | null;
	cardId: number | null;
	label: string;
	institution: string | null;
	completed: boolean;
	importHref: string;
	importHint: string | null;
};

type RoutineTarget = {
	name: string;
	institution: string | null;
	isArchived: boolean;
};

type RoutineCardTarget = RoutineTarget & {
	closingDay: number;
	dueDay: number;
};

export function suggestInvoiceMonthKeyForReferenceMonth(
	referenceMonthKey: string,
	closingDay: number,
	dueDay: number,
) {
	const period = parseMonthPeriod(referenceMonthKey);
	if (!period) return null;

	const startInvoice = getInvoiceForDate(period.start, closingDay, dueDay);
	const endInvoice = getInvoiceForDate(period.end, closingDay, dueDay);
	const ambiguous = startInvoice.key !== endInvoice.key;

	return {
		monthKey: endInvoice.key,
		ambiguous,
	};
}

export type ImportBatchPrefill = {
	mode: "account" | "card";
	accountId?: number;
	cardId?: number;
	invoiceMonthKey?: string;
	invoiceMonthHint?: string | null;
};

export function resolveImportBatchPrefill(input: {
	accountId?: string;
	cardId?: string;
	invoiceMonthKey?: string;
	usableAccounts: ReadonlyArray<{ id: number }>;
	usableCards: ReadonlyArray<{
		id: number;
		closingDay: number;
		dueDay: number;
	}>;
	referenceMonthKey?: string | null;
}): ImportBatchPrefill | undefined {
	const accountId = Number(input.accountId);
	if (
		input.accountId &&
		Number.isFinite(accountId) &&
		input.usableAccounts.some((account) => account.id === accountId)
	) {
		return { mode: "account", accountId };
	}

	const cardId = Number(input.cardId);
	const card = input.usableCards.find((entry) => entry.id === cardId);
	if (!input.cardId || !Number.isFinite(cardId) || !card) return undefined;

	const invoiceFromUrl = input.invoiceMonthKey
		? parseMonthKey(input.invoiceMonthKey)
		: null;
	const suggestion =
		input.referenceMonthKey !== undefined && input.referenceMonthKey !== null
			? suggestInvoiceMonthKeyForReferenceMonth(
					input.referenceMonthKey,
					card.closingDay,
					card.dueDay,
				)
			: null;

	return {
		mode: "card",
		cardId,
		invoiceMonthKey: invoiceFromUrl ?? suggestion?.monthKey,
		invoiceMonthHint: suggestion?.ambiguous
			? "Compras do mês podem cair em mais de uma fatura; conferimos pelo último dia do período."
			: null,
	};
}

export function buildImportRoutineImportHref(
	target: {
		kind: "account_statement" | "card_invoice";
		accountId: number | null;
		cardId: number | null;
	},
	referenceMonthKey: string | null,
	cardSchedule?: { closingDay: number; dueDay: number },
) {
	if (target.kind === "account_statement" && target.accountId !== null) {
		return `/import?accountId=${target.accountId}`;
	}

	if (target.kind === "card_invoice" && target.cardId !== null) {
		const params = new URLSearchParams({ cardId: String(target.cardId) });
		if (referenceMonthKey && cardSchedule) {
			const suggestion = suggestInvoiceMonthKeyForReferenceMonth(
				referenceMonthKey,
				cardSchedule.closingDay,
				cardSchedule.dueDay,
			);
			if (suggestion) {
				params.set("invoiceMonthKey", suggestion.monthKey);
			}
		}
		return `/import?${params.toString()}`;
	}

	return "/import";
}

export function buildImportRoutineChecklist(
	items: Array<{
		id: number;
		kind: "account_statement" | "card_invoice";
		accountId: number | null;
		cardId: number | null;
	}>,
	accountsById: ReadonlyMap<number, RoutineTarget>,
	cardsById: ReadonlyMap<number, RoutineCardTarget>,
	completedRoutineItemIds: ReadonlySet<number>,
	referenceMonthKey: string | null,
): ImportRoutineChecklistRow[] {
	const rows = items.flatMap((item): ImportRoutineChecklistRow[] => {
		if (item.kind === "account_statement" && item.accountId !== null) {
			const account = accountsById.get(item.accountId);
			if (!account || account.isArchived) return [];
			return [
				{
					routineItemId: item.id,
					kind: item.kind,
					accountId: item.accountId,
					cardId: null,
					label: `Extrato — ${account.name}`,
					institution: account.institution,
					completed: completedRoutineItemIds.has(item.id),
					importHref: buildImportRoutineImportHref(
						{
							kind: item.kind,
							accountId: item.accountId,
							cardId: null,
						},
						referenceMonthKey,
					),
					importHint: null,
				},
			];
		}
		if (item.kind === "card_invoice" && item.cardId !== null) {
			const card = cardsById.get(item.cardId);
			if (!card || card.isArchived) return [];
			const suggestion =
				referenceMonthKey !== null
					? suggestInvoiceMonthKeyForReferenceMonth(
							referenceMonthKey,
							card.closingDay,
							card.dueDay,
						)
					: null;
			return [
				{
					routineItemId: item.id,
					kind: item.kind,
					accountId: null,
					cardId: item.cardId,
					label: `Fatura — ${card.name}`,
					institution: card.institution,
					completed: completedRoutineItemIds.has(item.id),
					importHref: buildImportRoutineImportHref(
						{
							kind: item.kind,
							accountId: null,
							cardId: item.cardId,
						},
						referenceMonthKey,
						card,
					),
					importHint: suggestion?.ambiguous
						? "Compras do mês podem cair em mais de uma fatura; conferimos pelo último dia do período."
						: null,
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
