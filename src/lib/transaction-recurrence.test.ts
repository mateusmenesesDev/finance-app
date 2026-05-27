import { describe, expect, test } from "bun:test";

import { recurrenceLinkForTransactionUpdate } from "./transaction-recurrence";

describe("recurrenceLinkForTransactionUpdate", () => {
	const existing = {
		recurrenceId: 12,
		recurrenceOccurrenceOn: "2026-05-01",
		movementType: "income",
	};

	test("preserves a linked occurrence when the edit form omits recurrence fields", () => {
		expect(
			recurrenceLinkForTransactionUpdate({
				formHasRecurrenceFields: false,
				existing,
				nextMovementType: "income",
				parsedLink: { recurrenceId: null, recurrenceOccurrenceOn: null },
			}),
		).toEqual({
			recurrenceId: 12,
			recurrenceOccurrenceOn: "2026-05-01",
		});
	});

	test("keeps explicit recurrence edits authoritative", () => {
		expect(
			recurrenceLinkForTransactionUpdate({
				formHasRecurrenceFields: true,
				existing,
				nextMovementType: "income",
				parsedLink: { recurrenceId: null, recurrenceOccurrenceOn: null },
			}),
		).toEqual({ recurrenceId: null, recurrenceOccurrenceOn: null });
	});

	test("does not preserve the link when changing movement type", () => {
		expect(
			recurrenceLinkForTransactionUpdate({
				formHasRecurrenceFields: false,
				existing,
				nextMovementType: "expense",
				parsedLink: { recurrenceId: null, recurrenceOccurrenceOn: null },
			}),
		).toEqual({ recurrenceId: null, recurrenceOccurrenceOn: null });
	});
});
