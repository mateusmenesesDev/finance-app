import { describe, expect, test } from "bun:test";

import {
	calculateAccountBalances,
	getInvoiceForDate,
	type RuleAccount,
	type RuleTransaction,
} from "./finance-rules";

const accounts: RuleAccount[] = [
	{
		id: 1,
		type: "checking",
		initialBalanceCents: 100_00,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
	{
		id: 2,
		type: "credit_card",
		initialBalanceCents: 0,
		creditCardClosingDay: 10,
		creditCardDueDay: 20,
	},
	{
		id: 3,
		type: "cash",
		initialBalanceCents: 0,
		creditCardClosingDay: null,
		creditCardDueDay: null,
	},
];

function tx(overrides: Partial<RuleTransaction>): RuleTransaction {
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

describe("finance rules", () => {
	test("balances use only confirmed non-archived transactions", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({ movementType: "income", amountCents: 50_00 }),
			tx({ movementType: "expense", amountCents: 20_00, status: "planned" }),
			tx({ movementType: "expense", amountCents: 30_00, isArchived: true }),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(150_00);
	});

	test("one transfer transaction moves money to destination account", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({
				movementType: "transfer",
				amountCents: 25_00,
				destinationAccountId: 3,
			}),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(75_00);
		expect(balances.get(3)?.normalBalanceCents).toBe(25_00);
	});

	test("credit card payment reduces bank balance and card debt without expense duplication", () => {
		const balances = calculateAccountBalances(accounts, [
			tx({ accountId: 2, movementType: "expense", amountCents: 80_00 }),
			tx({
				movementType: "credit_card_payment",
				amountCents: 30_00,
				destinationAccountId: 2,
			}),
		]);

		expect(balances.get(1)?.normalBalanceCents).toBe(70_00);
		expect(balances.get(2)?.cardDebtCents).toBe(50_00);
	});

	test("invoice closing day is inclusive", () => {
		expect(getInvoiceForDate("2026-05-10", 10, 20)).toEqual({
			key: "2026-05",
			closingDate: "2026-05-10",
			dueDate: "2026-05-20",
		});
		expect(getInvoiceForDate("2026-05-11", 10, 20)).toEqual({
			key: "2026-06",
			closingDate: "2026-06-10",
			dueDate: "2026-06-20",
		});
	});
});
