import { describe, expect, test } from "bun:test";

import {
	accountImportRoutineEligibility,
	buildImportRoutineChecklist,
	buildImportRoutineImportHref,
	cardImportRoutineEligibility,
	isImportRoutineDayOneHighlight,
	referenceMonthKey,
	routineProgress,
	shouldCompactImportRoutineBlock,
	shouldShowRoutineBlock,
	suggestInvoiceMonthKeyForReferenceMonth,
} from "./import-routine";

describe("import routine domain", () => {
	test("referenceMonthKey returns previous calendar month", () => {
		expect(referenceMonthKey("2026-06")).toBe("2026-05");
	});

	test("referenceMonthKey rolls year boundary", () => {
		expect(referenceMonthKey("2026-01")).toBe("2025-12");
	});

	test("referenceMonthKey rejects invalid cycle keys", () => {
		expect(referenceMonthKey("2026-13")).toBe(null);
		expect(referenceMonthKey("2026-2")).toBe(null);
	});

	test("shouldShowRoutineBlock hides when there are no routine items", () => {
		expect(
			shouldShowRoutineBlock({
				activeItemCount: 0,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 5, 15),
			}),
		).toBe(false);
	});

	test("shouldShowRoutineBlock hides future cycle before that month starts", () => {
		expect(
			shouldShowRoutineBlock({
				activeItemCount: 2,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 4, 31),
			}),
		).toBe(false);
	});

	test("shouldShowRoutineBlock shows current cycle from day 1 onward", () => {
		expect(
			shouldShowRoutineBlock({
				activeItemCount: 2,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 5, 1),
			}),
		).toBe(true);
		expect(
			shouldShowRoutineBlock({
				activeItemCount: 2,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 5, 5),
			}),
		).toBe(true);
	});

	test("shouldShowRoutineBlock shows past cycles when items exist", () => {
		expect(
			shouldShowRoutineBlock({
				activeItemCount: 1,
				cycleMonthKey: "2026-05",
				today: new Date(2026, 5, 10),
			}),
		).toBe(true);
	});

	test("accountImportRoutineEligibility accepts active non-card accounts", () => {
		expect(
			accountImportRoutineEligibility({
				isArchived: false,
				type: "checking",
			}),
		).toEqual({ ok: true });
	});

	test("accountImportRoutineEligibility rejects archived and credit_card", () => {
		expect(
			accountImportRoutineEligibility({
				isArchived: true,
				type: "checking",
			}),
		).toEqual({ ok: false, message: "Conta arquivada" });
		expect(
			accountImportRoutineEligibility({
				isArchived: false,
				type: "credit_card",
			}),
		).toEqual({
			ok: false,
			message: "Cartões ficam na rotina pela tela Cartões",
		});
	});

	test("cardImportRoutineEligibility accepts active non-archived cards", () => {
		expect(
			cardImportRoutineEligibility({ isArchived: false, isActive: true }),
		).toEqual({ ok: true });
	});

	test("cardImportRoutineEligibility rejects archived or inactive cards", () => {
		expect(
			cardImportRoutineEligibility({ isArchived: true, isActive: true }),
		).toEqual({ ok: false, message: "Cartão arquivado" });
		expect(
			cardImportRoutineEligibility({ isArchived: false, isActive: false }),
		).toEqual({ ok: false, message: "Cartão inativo" });
	});

	test("buildImportRoutineChecklist joins accounts and cards with completion", () => {
		const rows = buildImportRoutineChecklist(
			[
				{
					id: 10,
					kind: "card_invoice",
					accountId: null,
					cardId: 2,
				},
				{
					id: 11,
					kind: "account_statement",
					accountId: 1,
					cardId: null,
				},
			],
			new Map([
				[
					1,
					{
						name: "Nubank",
						institution: "Nubank",
						isArchived: false,
					},
				],
			]),
			new Map([
				[
					2,
					{
						name: "Itaú",
						institution: "Itaú",
						isArchived: false,
						closingDay: 10,
						dueDay: 20,
					},
				],
			]),
			new Set([11]),
			"2026-05",
		);

		expect(rows).toEqual([
			{
				routineItemId: 11,
				kind: "account_statement",
				accountId: 1,
				cardId: null,
				label: "Extrato — Nubank",
				institution: "Nubank",
				completed: true,
				importHref: "/import?accountId=1",
				importHint: null,
			},
			{
				routineItemId: 10,
				kind: "card_invoice",
				accountId: null,
				cardId: 2,
				label: "Fatura — Itaú",
				institution: "Itaú",
				completed: false,
				importHref: "/import?cardId=2&invoiceMonthKey=2026-06",
				importHint:
					"Compras do mês podem cair em mais de uma fatura; conferimos pelo último dia do período.",
			},
		]);
	});

	test("suggestInvoiceMonthKeyForReferenceMonth uses end-of-month invoice", () => {
		expect(
			suggestInvoiceMonthKeyForReferenceMonth("2026-05", 10, 20),
		).toEqual({
			monthKey: "2026-06",
			ambiguous: true,
		});
	});

	test("buildImportRoutineImportHref encodes import query params", () => {
		expect(
			buildImportRoutineImportHref(
				{
					kind: "account_statement",
					accountId: 3,
					cardId: null,
				},
				"2026-05",
			),
		).toBe("/import?accountId=3");
		expect(
			buildImportRoutineImportHref(
				{
					kind: "card_invoice",
					accountId: null,
					cardId: 9,
				},
				"2026-05",
				{ closingDay: 10, dueDay: 20 },
			),
		).toBe("/import?cardId=9&invoiceMonthKey=2026-06");
	});

	test("buildImportRoutineChecklist drops archived targets", () => {
		expect(
			buildImportRoutineChecklist(
				[
					{
						id: 1,
						kind: "account_statement",
						accountId: 9,
						cardId: null,
					},
				],
				new Map([
					[9, { name: "Antiga", institution: null, isArchived: true }],
				]),
				new Map(),
				new Set(),
				"2026-05",
			),
		).toEqual([]);
	});

	test("isImportRoutineDayOneHighlight is true only on day 1 of current cycle", () => {
		expect(
			isImportRoutineDayOneHighlight("2026-06", new Date(2026, 5, 1)),
		).toBe(true);
		expect(
			isImportRoutineDayOneHighlight("2026-06", new Date(2026, 5, 2)),
		).toBe(false);
		expect(
			isImportRoutineDayOneHighlight("2026-05", new Date(2026, 5, 1)),
		).toBe(false);
	});

	test("shouldCompactImportRoutineBlock only applies to completed current cycle", () => {
		expect(
			shouldCompactImportRoutineBlock({
				isFullyComplete: true,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 5, 10),
			}),
		).toBe(true);
		expect(
			shouldCompactImportRoutineBlock({
				isFullyComplete: true,
				cycleMonthKey: "2026-05",
				today: new Date(2026, 5, 10),
			}),
		).toBe(false);
		expect(
			shouldCompactImportRoutineBlock({
				isFullyComplete: false,
				cycleMonthKey: "2026-06",
				today: new Date(2026, 5, 10),
			}),
		).toBe(false);
	});

	test("routineProgress aggregates completion state", () => {
		expect(routineProgress(6, new Set([1, 2, 3, 4]))).toEqual({
			completedCount: 4,
			totalCount: 6,
			isFullyComplete: false,
		});
		expect(routineProgress(6, new Set([1, 2, 3, 4, 5, 6]))).toEqual({
			completedCount: 6,
			totalCount: 6,
			isFullyComplete: true,
		});
		expect(routineProgress(0, new Set())).toEqual({
			completedCount: 0,
			totalCount: 0,
			isFullyComplete: false,
		});
	});
});
