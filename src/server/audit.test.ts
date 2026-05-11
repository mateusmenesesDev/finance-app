import { describe, expect, test } from "bun:test";

import { diffTransaction, type TransactionAuditSnapshot } from "~/server/audit";

const baseline: TransactionAuditSnapshot = {
	accountId: 1,
	destinationAccountId: null,
	categoryId: 10,
	movementType: "expense",
	status: "confirmed",
	amountCents: 1234,
	occurredOn: "2026-05-05",
	isArchived: false,
};

describe("diffTransaction", () => {
	test("returns empty diff when nothing relevant changed", () => {
		expect(diffTransaction(baseline, { ...baseline })).toEqual([]);
	});

	test("captures multiple field changes with from/to", () => {
		const after = {
			...baseline,
			amountCents: 9999,
			categoryId: 20,
			isArchived: true,
		};
		const diff = diffTransaction(baseline, after);
		expect(diff).toHaveLength(3);
		expect(diff.find((c) => c.field === "amountCents")).toEqual({
			field: "amountCents",
			from: 1234,
			to: 9999,
		});
		expect(diff.find((c) => c.field === "categoryId")?.to).toBe(20);
		expect(diff.find((c) => c.field === "isArchived")?.to).toBe(true);
	});

	test("ignores fields outside the audit list", () => {
		const after = { ...baseline } as TransactionAuditSnapshot & {
			description: string;
		};
		(after as unknown as { description: string }).description = "novo";
		expect(diffTransaction(baseline, after)).toEqual([]);
	});

	test("returns empty when before or after is null", () => {
		expect(diffTransaction(null, baseline)).toEqual([]);
		expect(diffTransaction(baseline, null)).toEqual([]);
	});
});
