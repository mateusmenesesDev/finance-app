import { describe, expect, test } from "bun:test";

import {
	generateOccurrences,
	lateRecurrences,
	matchImportedRowToRecurrence,
	type RecurrenceInput,
	rankFixedExpenses,
	recurrencesToPlannedMovements,
	subscriptionReviewSuggestions,
} from "./recurrences";

function recurrence(overrides: Partial<RecurrenceInput> = {}): RecurrenceInput {
	return {
		id: 1,
		accountId: 10,
		categoryId: 20,
		movementType: "expense",
		amountCents: 100_00,
		frequency: "monthly",
		intervalCount: 1,
		anchorDay: null,
		anchorWeekday: null,
		startsOn: "2024-01-01",
		endsOn: null,
		isSubscription: false,
		isBill: false,
		isArchived: false,
		name: "Recorrência",
		...overrides,
	};
}

describe("recurrences", () => {
	test("once generates exactly one occurrence only inside the window", () => {
		const input = recurrence({ frequency: "once", startsOn: "2024-03-10" });

		expect(
			generateOccurrences(input, { start: "2024-03-01", end: "2024-03-31" }),
		).toEqual([
			{
				recurrenceId: 1,
				occurrenceOn: "2024-03-10",
				accountId: 10,
				amountCents: 100_00,
				movementType: "expense",
			},
		]);
		expect(
			generateOccurrences(input, { start: "2024-04-01", end: "2024-04-30" }),
		).toEqual([]);
	});

	test("monthly anchor day clamps to the last day of shorter months", () => {
		const input = recurrence({
			frequency: "monthly",
			anchorDay: 31,
			startsOn: "2024-01-31",
		});

		expect(
			generateOccurrences(input, {
				start: "2024-01-01",
				end: "2024-04-30",
			}).map((occurrence) => occurrence.occurrenceOn),
		).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);

		expect(
			generateOccurrences(
				{ ...input, startsOn: "2023-01-31" },
				{ start: "2023-02-01", end: "2023-02-28" },
			).map((occurrence) => occurrence.occurrenceOn),
		).toEqual(["2023-02-28"]);
	});

	test("weekly interval count generates every other week from anchor weekday", () => {
		const input = recurrence({
			frequency: "weekly",
			intervalCount: 2,
			anchorWeekday: 1,
			startsOn: "2024-01-03",
		});

		expect(
			generateOccurrences(input, {
				start: "2024-01-01",
				end: "2024-02-15",
			}).map((occurrence) => occurrence.occurrenceOn),
		).toEqual(["2024-01-08", "2024-01-22", "2024-02-05"]);
	});

	test("yearly anchors on the month and day of startsOn", () => {
		const input = recurrence({ frequency: "yearly", startsOn: "2024-02-29" });

		expect(
			generateOccurrences(input, {
				start: "2024-01-01",
				end: "2027-12-31",
			}).map((occurrence) => occurrence.occurrenceOn),
		).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28"]);
	});

	test("endsOn excludes later occurrences", () => {
		const input = recurrence({ startsOn: "2024-01-15", endsOn: "2024-03-15" });

		expect(
			generateOccurrences(input, {
				start: "2024-01-01",
				end: "2024-05-31",
			}).map((occurrence) => occurrence.occurrenceOn),
		).toEqual(["2024-01-15", "2024-02-15", "2024-03-15"]);
	});

	test("cap throws when exceeded", () => {
		let message = "";
		try {
			generateOccurrences(
				recurrence({ frequency: "weekly", startsOn: "2024-01-01" }),
				{ start: "2024-01-01", end: "2024-03-31" },
				{ cap: 3 },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message.includes("exceeded cap")).toBe(true);
	});

	test("planned movements remove confirmed occurrences and ignore archived", () => {
		const movements = recurrencesToPlannedMovements(
			[
				recurrence({ id: 1, startsOn: "2024-01-10" }),
				recurrence({ id: 2, startsOn: "2024-01-10", isArchived: true }),
			],
			[{ recurrenceId: 1, occurrenceOn: "2024-02-10" }],
			{ start: "2024-01-01", end: "2024-03-31" },
		);

		expect(movements.map((movement) => movement.occurredOn)).toEqual([
			"2024-01-10",
			"2024-03-10",
		]);
	});

	test("late recurrences return past unconfirmed only", () => {
		const late = lateRecurrences(
			[recurrence({ id: 1, startsOn: "2024-01-02" })],
			[{ recurrenceId: 1, occurrenceOn: "2024-03-02" }],
			"2024-04-01",
		);

		expect(late.map((item) => item.occurrenceOn)).toEqual([
			"2024-01-02",
			"2024-02-02",
		]);
	});

	test("rank fixed expenses orders by normalized monthly cents", () => {
		const ranked = rankFixedExpenses([
			recurrence({
				id: 1,
				name: "Yearly",
				frequency: "yearly",
				amountCents: 1200_00,
			}),
			recurrence({
				id: 2,
				name: "Weekly",
				frequency: "weekly",
				amountCents: 100_00,
			}),
			recurrence({
				id: 3,
				name: "Monthly",
				frequency: "monthly",
				amountCents: 200_00,
			}),
		]);

		expect(
			ranked.map((item) => [item.recurrenceId, item.monthlyAmountCents]),
		).toEqual([
			[2, 43450],
			[3, 20000],
			[1, 10000],
		]);
	});

	test("subscription review suggestions flag high value, stale and both", () => {
		const suggestions = subscriptionReviewSuggestions(
			[
				recurrence({ id: 1, isSubscription: true, amountCents: 500_00 }),
				recurrence({ id: 2, isSubscription: true, amountCents: 400_00 }),
				recurrence({ id: 3, isSubscription: true, amountCents: 100_00 }),
			],
			[
				{ recurrenceId: 1, occurrenceOn: "2024-05-01" },
				{ recurrenceId: 3, occurrenceOn: "2024-05-01" },
			],
			"2024-05-20",
			{ topN: 1, staleMonths: 2 },
		);

		expect(suggestions).toEqual([
			{
				recurrenceId: 1,
				reason: "high_value",
				lastConfirmedOn: "2024-05-01",
				monthlyAmountCents: 50000,
			},
			{
				recurrenceId: 2,
				reason: "stale",
				lastConfirmedOn: null,
				monthlyAmountCents: 40000,
			},
		]);

		expect(
			subscriptionReviewSuggestions(
				[recurrence({ id: 4, isSubscription: true, amountCents: 600_00 })],
				[{ recurrenceId: 4, occurrenceOn: "2024-01-01" }],
				"2024-05-20",
				{ topN: 1, staleMonths: 2 },
			)[0]?.reason,
		).toBe("both");
	});

	test("match imported row finds nearest unmatched occurrence within tolerances", () => {
		const nearestRecurrence = recurrence({
			id: 2,
			accountId: 10,
			amountCents: 100_50,
			startsOn: "2024-01-12",
		});
		const recurrences = [
			recurrence({
				id: 1,
				accountId: 10,
				amountCents: 100_00,
				startsOn: "2024-01-10",
			}),
			nearestRecurrence,
		];

		expect(
			matchImportedRowToRecurrence(
				{
					accountId: 10,
					movementType: "expense",
					amountCents: 100_75,
					occurredOn: "2024-02-13",
				},
				recurrences,
				[],
				"2024-02-13",
			),
		).toEqual({ recurrenceId: 2, occurrenceOn: "2024-02-12" });

		expect(
			matchImportedRowToRecurrence(
				{
					accountId: 10,
					movementType: "expense",
					amountCents: 120_00,
					occurredOn: "2024-02-12",
				},
				recurrences,
				[],
				"2024-02-12",
			),
		).toBe(null);

		expect(
			matchImportedRowToRecurrence(
				{
					accountId: 10,
					movementType: "expense",
					amountCents: 100_50,
					occurredOn: "2024-02-12",
				},
				[nearestRecurrence],
				[{ recurrenceId: 2, occurrenceOn: "2024-02-12" }],
				"2024-02-12",
			),
		).toBe(null);
	});

	test("batch-level recurrence matching prevents reusing the same occurrence", () => {
		const input = recurrence({ startsOn: "2024-01-10", anchorDay: 10 });
		const confirmed: { recurrenceId: number; occurrenceOn: string }[] = [];
		const first = matchImportedRowToRecurrence(
			{
				accountId: 10,
				movementType: "expense",
				amountCents: 100_00,
				occurredOn: "2024-02-09",
			},
			[input],
			confirmed,
			"2024-02-09",
		);
		expect(first).toEqual({ recurrenceId: 1, occurrenceOn: "2024-02-10" });
		const second = matchImportedRowToRecurrence(
			{
				accountId: 10,
				movementType: "expense",
				amountCents: 100_00,
				occurredOn: "2024-02-10",
			},
			[input],
			first ? [first] : [],
			"2024-02-10",
		);
		expect(second).toBe(null);
	});
});
