import { describe, expect, test } from "bun:test";

import { formatMoney } from "./formatters";

describe("formatMoney", () => {
	test("formats stored cents as BRL", () => {
		expect(formatMoney(901_822)).toBe("R$ 9.018,22");
	});
});
