import type { PlannedMovement } from "./cash-flow";

export type RecurrenceFrequency = "once" | "weekly" | "monthly" | "yearly";
export type RecurrenceInput = {
	id: number;
	accountId: number;
	categoryId: number | null;
	movementType: PlannedMovement["movementType"];
	amountCents: number;
	frequency: RecurrenceFrequency;
	intervalCount: number;
	anchorDay: number | null;
	anchorWeekday: number | null;
	startsOn: string;
	endsOn: string | null;
	isSubscription: boolean;
	isBill: boolean;
	isArchived: boolean;
	name: string;
};
export type Occurrence = {
	recurrenceId: number;
	occurrenceOn: string;
	accountId: number;
	amountCents: number;
	movementType: PlannedMovement["movementType"];
};
export type ConfirmedOccurrenceKey = {
	recurrenceId: number;
	occurrenceOn: string;
};

export const MATCH_VALUE_TOLERANCE_CENTS = 100;
export const MATCH_VALUE_TOLERANCE_RATIO = 0.05;
export const MATCH_DATE_TOLERANCE_DAYS = 3;

const DEFAULT_CAP = 366;

export function generateOccurrences(
	recurrence: RecurrenceInput,
	window: { start: string; end: string },
	options: { cap?: number } = {},
): Occurrence[] {
	const cap = options.cap ?? DEFAULT_CAP;
	const effectiveStart = maxIso(window.start, recurrence.startsOn);
	const effectiveEnd = minIso(window.end, recurrence.endsOn ?? window.end);
	if (effectiveStart > effectiveEnd) return [];

	const occurrences: Occurrence[] = [];
	const push = (occurrenceOn: string) => {
		if (occurrenceOn < effectiveStart || occurrenceOn > effectiveEnd) return;
		occurrences.push({
			recurrenceId: recurrence.id,
			occurrenceOn,
			accountId: recurrence.accountId,
			amountCents: recurrence.amountCents,
			movementType: recurrence.movementType,
		});
		if (occurrences.length > cap) {
			throw new Error(`recurrence ${recurrence.id} exceeded cap of ${cap}`);
		}
	};

	if (recurrence.frequency === "once") {
		push(recurrence.startsOn);
		return occurrences;
	}

	if (recurrence.frequency === "weekly") {
		const intervalDays = recurrence.intervalCount * 7;
		let cursor = firstWeeklyOccurrence(recurrence);
		if (cursor < effectiveStart) {
			const jumps = Math.floor(
				daysBetween(cursor, effectiveStart) / intervalDays,
			);
			cursor = addDaysIso(cursor, jumps * intervalDays);
			while (cursor < effectiveStart) cursor = addDaysIso(cursor, intervalDays);
		}
		while (cursor <= effectiveEnd) {
			push(cursor);
			cursor = addDaysIso(cursor, intervalDays);
		}
		return occurrences;
	}

	if (recurrence.frequency === "monthly") {
		let offset = monthsBetween(
			monthStart(recurrence.startsOn),
			monthStart(effectiveStart),
		);
		offset -= offset % recurrence.intervalCount;
		let cursor = monthlyOccurrence(recurrence, offset);
		while (cursor < recurrence.startsOn || cursor < effectiveStart) {
			offset += recurrence.intervalCount;
			cursor = monthlyOccurrence(recurrence, offset);
		}
		while (cursor <= effectiveEnd) {
			push(cursor);
			offset += recurrence.intervalCount;
			cursor = monthlyOccurrence(recurrence, offset);
		}
		return occurrences;
	}

	let offset =
		parseDate(effectiveStart).getFullYear() -
		parseDate(recurrence.startsOn).getFullYear();
	offset -= offset % recurrence.intervalCount;
	let cursor = yearlyOccurrence(recurrence, offset);
	while (cursor < recurrence.startsOn || cursor < effectiveStart) {
		offset += recurrence.intervalCount;
		cursor = yearlyOccurrence(recurrence, offset);
	}
	while (cursor <= effectiveEnd) {
		push(cursor);
		offset += recurrence.intervalCount;
		cursor = yearlyOccurrence(recurrence, offset);
	}
	return occurrences;
}

export function recurrencesToPlannedMovements(
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
	window: { start: string; end: string },
	options: { cap?: number } = {},
): PlannedMovement[] {
	const confirmedKeys = keySet(confirmed);
	return recurrences
		.filter((recurrence) => !recurrence.isArchived)
		.flatMap((recurrence) =>
			generateOccurrences(recurrence, window, options).filter(
				(occurrence) => !confirmedKeys.has(occurrenceKey(occurrence)),
			),
		)
		.map((occurrence) => ({
			accountId: occurrence.accountId,
			amountCents: occurrence.amountCents,
			movementType: occurrence.movementType,
			occurredOn: occurrence.occurrenceOn,
		}));
}

export function lateRecurrences(
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
	today: string,
): { recurrence: RecurrenceInput; occurrenceOn: string }[] {
	const confirmedKeys = keySet(confirmed);
	const window = { start: addDaysIso(today, -90), end: addDaysIso(today, -1) };
	return recurrences
		.filter((recurrence) => !recurrence.isArchived)
		.flatMap((recurrence) =>
			generateOccurrences(recurrence, window)
				.filter((occurrence) => !confirmedKeys.has(occurrenceKey(occurrence)))
				.map((occurrence) => ({
					recurrence,
					occurrenceOn: occurrence.occurrenceOn,
				})),
		);
}

export function rankFixedExpenses(
	recurrences: RecurrenceInput[],
	monthsBack = 6,
): {
	recurrenceId: number;
	name: string;
	monthlyAmountCents: number;
	isSubscription: boolean;
	isBill: boolean;
}[] {
	const onceCutoff = addMonthsIso(
		recurrences.reduce(
			(latest, recurrence) => maxIso(latest, recurrence.startsOn),
			"0000-01-01",
		),
		-monthsBack,
	);
	return recurrences
		.filter(
			(recurrence) =>
				!recurrence.isArchived && recurrence.movementType === "expense",
		)
		.map((recurrence) => ({
			recurrenceId: recurrence.id,
			name: recurrence.name,
			monthlyAmountCents: monthlyAmountCents(
				recurrence,
				monthsBack,
				onceCutoff,
			),
			isSubscription: recurrence.isSubscription,
			isBill: recurrence.isBill,
		}))
		.sort((left, right) => right.monthlyAmountCents - left.monthlyAmountCents);
}

export function subscriptionReviewSuggestions(
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
	today: string,
	options: { topN?: number; staleMonths?: number } = {},
): {
	recurrenceId: number;
	reason: "high_value" | "stale" | "both";
	lastConfirmedOn: string | null;
	monthlyAmountCents: number;
}[] {
	const topN = options.topN ?? 5;
	const staleMonths = options.staleMonths ?? 2;
	const subscriptions = recurrences.filter(
		(recurrence) => !recurrence.isArchived && recurrence.isSubscription,
	);
	const highValue = new Set(
		rankFixedExpenses(subscriptions)
			.slice(0, topN)
			.map((ranked) => ranked.recurrenceId),
	);
	const staleCutoff = addMonthsIso(today, -staleMonths);

	return subscriptions
		.map((recurrence) => {
			const lastConfirmedOn =
				confirmed
					.filter((key) => key.recurrenceId === recurrence.id)
					.map((key) => key.occurrenceOn)
					.sort()
					.at(-1) ?? null;
			const isHighValue = highValue.has(recurrence.id);
			const isStale = lastConfirmedOn === null || lastConfirmedOn < staleCutoff;
			if (!isHighValue && !isStale) return null;
			const reason: "high_value" | "stale" | "both" =
				isHighValue && isStale ? "both" : isHighValue ? "high_value" : "stale";
			return {
				recurrenceId: recurrence.id,
				reason,
				lastConfirmedOn,
				monthlyAmountCents: monthlyAmountCents(recurrence),
			};
		})
		.filter((suggestion) => suggestion !== null)
		.sort((left, right) => right.monthlyAmountCents - left.monthlyAmountCents);
}

export function matchImportedRowToRecurrence(
	row: {
		accountId: number;
		movementType: "income" | "expense";
		amountCents: number;
		occurredOn: string;
	},
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
	_today: string,
): { recurrenceId: number; occurrenceOn: string } | null {
	return matchImportedRowToRecurrenceOccurrence(
		row,
		recurrences,
		confirmed,
		false,
	);
}

export function matchImportedRowToConfirmedRecurrence(
	row: {
		accountId: number;
		movementType: "income" | "expense";
		amountCents: number;
		occurredOn: string;
	},
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
): { recurrenceId: number; occurrenceOn: string } | null {
	return matchImportedRowToRecurrenceOccurrence(
		row,
		recurrences,
		confirmed,
		true,
	);
}

function matchImportedRowToRecurrenceOccurrence(
	row: {
		accountId: number;
		movementType: "income" | "expense";
		amountCents: number;
		occurredOn: string;
	},
	recurrences: RecurrenceInput[],
	confirmed: ConfirmedOccurrenceKey[],
	confirmedOnly: boolean,
): { recurrenceId: number; occurrenceOn: string } | null {
	const confirmedKeys = keySet(confirmed);
	const window = {
		start: addDaysIso(row.occurredOn, -MATCH_DATE_TOLERANCE_DAYS),
		end: addDaysIso(row.occurredOn, MATCH_DATE_TOLERANCE_DAYS),
	};
	const candidates = recurrences
		.filter(
			(recurrence) =>
				!recurrence.isArchived &&
				recurrence.accountId === row.accountId &&
				recurrence.movementType === row.movementType,
		)
		.flatMap((recurrence) => generateOccurrences(recurrence, window))
		.filter((occurrence) =>
			confirmedOnly
				? confirmedKeys.has(occurrenceKey(occurrence))
				: !confirmedKeys.has(occurrenceKey(occurrence)),
		)
		.map((occurrence) => ({
			occurrence,
			dayDelta: Math.abs(daysBetween(row.occurredOn, occurrence.occurrenceOn)),
			valueDelta: Math.abs(row.amountCents - occurrence.amountCents),
		}))
		.filter(
			(candidate) =>
				candidate.valueDelta <=
				Math.max(
					MATCH_VALUE_TOLERANCE_CENTS,
					Math.round(
						candidate.occurrence.amountCents * MATCH_VALUE_TOLERANCE_RATIO,
					),
				),
		)
		.sort(
			(left, right) =>
				left.dayDelta - right.dayDelta || left.valueDelta - right.valueDelta,
		);

	const best = candidates[0]?.occurrence;
	if (!best) return null;
	return { recurrenceId: best.recurrenceId, occurrenceOn: best.occurrenceOn };
}

function monthlyAmountCents(
	recurrence: RecurrenceInput,
	monthsBack = 6,
	onceCutoff = "9999-12-31",
) {
	if (recurrence.frequency === "weekly") {
		return Math.round(
			(recurrence.amountCents * 4.345) / recurrence.intervalCount,
		);
	}
	if (recurrence.frequency === "monthly") {
		return Math.round(recurrence.amountCents / recurrence.intervalCount);
	}
	if (recurrence.frequency === "yearly") {
		return Math.round(recurrence.amountCents / (12 * recurrence.intervalCount));
	}
	return recurrence.startsOn >= onceCutoff
		? Math.round(recurrence.amountCents / monthsBack)
		: 0;
}

function firstWeeklyOccurrence(recurrence: RecurrenceInput) {
	const start = parseDate(recurrence.startsOn);
	const target = recurrence.anchorWeekday ?? start.getDay();
	const delta = (target - start.getDay() + 7) % 7;
	return addDaysIso(recurrence.startsOn, delta);
}

function monthlyOccurrence(recurrence: RecurrenceInput, monthOffset: number) {
	const start = parseDate(recurrence.startsOn);
	const year = start.getFullYear();
	const month = start.getMonth() + monthOffset;
	const day = Math.min(
		recurrence.anchorDay ?? start.getDate(),
		lastDayOfMonth(year, month),
	);
	return formatDate(new Date(year, month, day));
}

function yearlyOccurrence(recurrence: RecurrenceInput, yearOffset: number) {
	const start = parseDate(recurrence.startsOn);
	const year = start.getFullYear() + yearOffset;
	const day = Math.min(start.getDate(), lastDayOfMonth(year, start.getMonth()));
	return formatDate(new Date(year, start.getMonth(), day));
}

function keySet(keys: ConfirmedOccurrenceKey[]) {
	return new Set(keys.map(occurrenceKey));
}

function occurrenceKey(key: ConfirmedOccurrenceKey) {
	return `${key.recurrenceId}:${key.occurrenceOn}`;
}

function parseDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysIso(dateIso: string, days: number) {
	const date = parseDate(dateIso);
	return formatDate(
		new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
	);
}

function addMonthsIso(dateIso: string, months: number) {
	const date = parseDate(dateIso);
	return formatDate(
		new Date(date.getFullYear(), date.getMonth() + months, date.getDate()),
	);
}

function daysBetween(left: string, right: string) {
	return Math.round(
		(parseDate(right).valueOf() - parseDate(left).valueOf()) / 86_400_000,
	);
}

function monthsBetween(leftMonth: string, rightMonth: string) {
	const left = parseDate(leftMonth);
	const right = parseDate(rightMonth);
	return (
		(right.getFullYear() - left.getFullYear()) * 12 +
		right.getMonth() -
		left.getMonth()
	);
}

function monthStart(dateIso: string) {
	return `${dateIso.slice(0, 7)}-01`;
}

function lastDayOfMonth(year: number, month: number) {
	return new Date(year, month + 1, 0).getDate();
}

function minIso(left: string, right: string) {
	return left < right ? left : right;
}

function maxIso(left: string, right: string) {
	return left > right ? left : right;
}
