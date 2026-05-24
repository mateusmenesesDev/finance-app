import { describe, expect, test } from "bun:test";

import {
	aggregateCashFlow,
	bucketKey,
	bucketRange,
	type CashFlowAccount,
	type CashFlowTransaction,
	comparePlannedVsRealized,
	computeFutureInvoices,
	consolidatedTimeline,
	negativeBalanceAlerts,
	projectAccountBalances,
} from "./cash-flow";
import {
	type RecurrenceInput,
	recurrencesToPlannedMovements,
} from "./recurrences";

const accounts: CashFlowAccount[] = [
	{
		id: 1,
		type: "checking",
		initialBalanceCents: 100_00,
		creditCardClosingDay: null,
		creditCardDueDay: null,
		name: "Banco",
	},
	{
		id: 2,
		type: "credit_card",
		initialBalanceCents: 0,
		creditCardClosingDay: 10,
		creditCardDueDay: 20,
		name: "Cartão",
	},
];

function tx(overrides: Partial<CashFlowTransaction>): CashFlowTransaction {
	return {
		accountId: 1,
		destinationAccountId: null,
		movementType: "expense",
		status: "confirmed",
		amountCents: 10_00,
		occurredOn: "2026-05-01",
		isArchived: false,
		...overrides,
	};
}

describe("cash flow", () => {
	test("bucket keys support day, ISO week, month and year", () => {
		expect(bucketKey("2026-01-01", "day")).toBe("2026-01-01");
		expect(bucketKey("2026-12-31", "month")).toBe("2026-12");
		expect(bucketKey("2026-12-31", "year")).toBe("2026");
		expect(bucketKey("2026-01-01", "week")).toBe("2025-12-29-W01");
		expect(bucketKey("2026-01-05", "week")).toBe("2026-01-05-W02");
	});

	test("bucket ranges are ordered and clipped to the requested window", () => {
		expect(bucketRange("2026-01-02", "2026-01-12", "week")).toEqual([
			{
				key: "2025-12-29-W01",
				start: "2026-01-02",
				end: "2026-01-04",
				label: "Semana de 2025-12-29",
			},
			{
				key: "2026-01-05-W02",
				start: "2026-01-05",
				end: "2026-01-11",
				label: "Semana de 2026-01-05",
			},
			{
				key: "2026-01-12-W03",
				start: "2026-01-12",
				end: "2026-01-12",
				label: "Semana de 2026-01-12",
			},
		]);
	});

	test("future invoices exclude fully paid cycles and lower partial payments", () => {
		const invoices = computeFutureInvoices(
			accounts,
			[
				tx({ accountId: 2, amountCents: 100_00, occurredOn: "2026-05-05" }),
				tx({
					accountId: 1,
					destinationAccountId: 2,
					movementType: "credit_card_payment",
					amountCents: 40_00,
					occurredOn: "2026-05-15",
				}),
				tx({ accountId: 2, amountCents: 50_00, occurredOn: "2026-06-05" }),
				tx({
					accountId: 1,
					destinationAccountId: 2,
					movementType: "credit_card_payment",
					amountCents: 50_00,
					occurredOn: "2026-06-15",
				}),
			],
			"2026-05-01",
		);

		expect(invoices).toEqual([
			{
				accountId: 2,
				accountName: "Cartão",
				key: "2026-05",
				closingDate: "2026-05-10",
				dueDate: "2026-05-20",
				totalCents: 100_00,
				paidCents: 40_00,
				remainingCents: 60_00,
			},
		]);
	});

	test("aggregation separates realized, planned and pending statuses", () => {
		const result = aggregateCashFlow({
			accounts,
			transactions: [
				tx({
					movementType: "income",
					amountCents: 100_00,
					status: "confirmed",
				}),
				tx({ movementType: "expense", amountCents: 30_00, status: "planned" }),
				tx({
					movementType: "expense",
					amountCents: 20_00,
					status: "pending_review",
				}),
				tx({ movementType: "expense", amountCents: 10_00, status: "ignored" }),
				tx({ movementType: "expense", amountCents: 10_00, isArchived: true }),
			],
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
		});

		expect(result.totals).toEqual({
			realizedIncome: 100_00,
			realizedExpense: 0,
			plannedIncome: 0,
			plannedExpense: 30_00,
			invoiceOutflow: 0,
		});
		expect(result.pending).toEqual({ transactionCount: 1, amountCents: 20_00 });
	});

	test("credit card purchases are excluded from realized cash flow in the purchase month", () => {
		const result = aggregateCashFlow({
			accounts,
			transactions: [
				tx({
					accountId: 2,
					movementType: "expense",
					amountCents: 20_00,
					status: "confirmed",
					occurredOn: "2026-05-10",
				}),
				tx({
					accountId: 2,
					movementType: "expense",
					amountCents: 15_00,
					status: "planned",
					occurredOn: "2026-05-12",
				}),
			],
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
		});

		expect(result.totals.realizedExpense).toBe(0);
		expect(result.totals.plannedExpense).toBe(0);
	});

	test("credit card payment from a normal account remains in realized expense", () => {
		const result = aggregateCashFlow({
			accounts,
			transactions: [
				tx({
					accountId: 1,
					destinationAccountId: 2,
					movementType: "credit_card_payment",
					amountCents: 35_00,
					status: "confirmed",
					occurredOn: "2026-05-20",
				}),
			],
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
		});

		expect(result.totals.realizedExpense).toBe(35_00);
	});

	test("per-account running balance ignores invoices but consolidated includes them", () => {
		const transactions = [
			tx({
				accountId: 1,
				amountCents: 90_00,
				status: "planned",
				occurredOn: "2026-05-02",
			}),
			tx({
				accountId: 2,
				amountCents: 50_00,
				status: "confirmed",
				occurredOn: "2026-05-05",
			}),
		];
		const projections = projectAccountBalances({
			accounts,
			transactions,
			window: { start: "2026-05-01", end: "2026-05-31" },
			today: "2026-05-01",
		});
		const timeline = consolidatedTimeline({
			accounts,
			transactions,
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
		});

		expect(projections[0]?.closingProjectedCents).toBe(10_00);
		expect(timeline[0]?.closingCents).toBe(-40_00);
	});

	test("negative alert uses intermediate minimum even when final balance is positive", () => {
		const projections = projectAccountBalances({
			accounts,
			transactions: [
				tx({
					amountCents: 150_00,
					status: "planned",
					occurredOn: "2026-05-02",
				}),
				tx({
					movementType: "income",
					amountCents: 100_00,
					status: "planned",
					occurredOn: "2026-05-03",
				}),
			],
			window: { start: "2026-05-01", end: "2026-05-04" },
			today: "2026-05-01",
		});

		expect(negativeBalanceAlerts(projections)).toEqual([
			{
				accountId: 1,
				accountName: "Banco",
				minCents: -50_00,
				minDate: "2026-05-02",
			},
		]);
	});

	test("recurrence planned movements are included and confirmed occurrences suppressed", () => {
		const recurrence: RecurrenceInput = {
			id: 1,
			accountId: 1,
			categoryId: 1,
			movementType: "income",
			amountCents: 2_000_00,
			frequency: "monthly",
			intervalCount: 1,
			anchorDay: 5,
			anchorWeekday: null,
			startsOn: "2026-05-05",
			endsOn: null,
			isSubscription: false,
			isBill: false,
			isArchived: false,
			name: "Salário",
		};
		const window = { start: "2026-05-01", end: "2026-06-30" };
		const result = aggregateCashFlow({
			accounts,
			transactions: [],
			window,
			granularity: "month",
			today: "2026-05-01",
			extraPlannedMovements: recurrencesToPlannedMovements(
				[recurrence],
				[],
				window,
			),
		});
		expect(result.buckets.map((bucket) => bucket.plannedIncome)).toEqual([
			2_000_00, 2_000_00,
		]);

		const suppressed = aggregateCashFlow({
			accounts,
			transactions: [],
			window,
			granularity: "month",
			today: "2026-05-01",
			extraPlannedMovements: recurrencesToPlannedMovements(
				[recurrence],
				[{ recurrenceId: 1, occurrenceOn: "2026-05-05" }],
				window,
			),
		});
		expect(suppressed.buckets.map((bucket) => bucket.plannedIncome)).toEqual([
			0, 2_000_00,
		]);
	});

	test("planned vs realized has null percent when planned is zero", () => {
		const aggregate = aggregateCashFlow({
			accounts,
			transactions: [tx({ movementType: "income", amountCents: 10_00 })],
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
		});

		expect(comparePlannedVsRealized(aggregate.buckets)[0]?.deltaPercent).toBe(
			null,
		);
	});

	test("extra planned movements shift bucket totals", () => {
		const result = aggregateCashFlow({
			accounts,
			transactions: [],
			window: { start: "2026-05-01", end: "2026-05-31" },
			granularity: "month",
			today: "2026-05-01",
			extraPlannedMovements: [
				{
					accountId: 1,
					amountCents: 42_00,
					movementType: "income",
					occurredOn: "2026-05-10",
				},
			],
		});

		expect(result.totals.plannedIncome).toBe(42_00);
	});
});
