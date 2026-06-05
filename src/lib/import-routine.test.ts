import { describe, expect, test } from "bun:test";

import {
	accountImportRoutineEligibility,
	cardImportRoutineEligibility,
	referenceMonthKey,
	routineProgress,
	shouldShowRoutineBlock,
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
