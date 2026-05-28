import { describe, expect, test } from "bun:test";

import { parseInvoiceMonthKey, parseMonthKey } from "./month-key";

describe("month key parsing", () => {
	test("accepts canonical yyyy-mm month keys", () => {
		expect(parseMonthKey("2026-04")).toBe("2026-04");
		expect(parseInvoiceMonthKey("2026-12", 2030)).toBe("2026-12");
	});

	test("rejects invalid canonical months", () => {
		expect(parseMonthKey("2026-00")).toBe(null);
		expect(parseMonthKey("2026-13")).toBe(null);
		expect(parseMonthKey("04")).toBe(null);
	});

	test("invoice month accepts numeric month in current year", () => {
		expect(parseInvoiceMonthKey("4", 2026)).toBe("2026-04");
		expect(parseInvoiceMonthKey("04", 2026)).toBe("2026-04");
	});

	test("invoice month accepts portuguese month names", () => {
		expect(parseInvoiceMonthKey("abril", 2026)).toBe("2026-04");
		expect(parseInvoiceMonthKey("Março", 2026)).toBe("2026-03");
		expect(parseInvoiceMonthKey("abr", 2026)).toBe("2026-04");
	});

	test("invoice month rejects unknown input", () => {
		expect(parseInvoiceMonthKey("foo", 2026)).toBe(null);
		expect(parseInvoiceMonthKey("13", 2026)).toBe(null);
	});
});
