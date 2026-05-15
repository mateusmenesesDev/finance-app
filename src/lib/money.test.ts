import { describe, expect, test } from "bun:test";

import { MAX_AMOUNT_CENTS, moneyToCents } from "./money";

function captureError(fn: () => unknown) {
	try {
		fn();
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

describe("moneyToCents", () => {
	test("parses standard BRL formatted strings", () => {
		expect(moneyToCents("12,34", { allowZero: false })).toBe(1234);
		expect(moneyToCents("1.234,56", { allowZero: false })).toBe(123456);
	});

	test("accepts the int32 ceiling exactly", () => {
		expect(moneyToCents("21474836,47", { allowZero: false })).toBe(
			MAX_AMOUNT_CENTS,
		);
	});

	test("rejects values above the int32 ceiling", () => {
		expect(
			captureError(() => moneyToCents("21474836,48", { allowZero: false })),
		).toBe("Valor excede o limite suportado");
		expect(
			captureError(() => moneyToCents("6.9E+24", { allowZero: false })),
		).toBe("Valor excede o limite suportado");
	});

	test("rejects negatives and NaN", () => {
		expect(
			captureError(() => moneyToCents("-1,00", { allowZero: false })),
		).toBe("Valor inválido");
		expect(captureError(() => moneyToCents("abc", { allowZero: false }))).toBe(
			"Valor inválido",
		);
	});

	test("zero handling honors allowZero flag", () => {
		expect(captureError(() => moneyToCents("0", { allowZero: false }))).toBe(
			"Valor deve ser maior que zero",
		);
		expect(moneyToCents("0", { allowZero: true })).toBe(0);
	});
});
