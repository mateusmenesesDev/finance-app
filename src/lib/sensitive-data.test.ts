import { describe, expect, test } from "bun:test";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import * as schema from "~/server/db/schema";
import {
	forbiddenColumnPatterns,
	maskSensitive,
	sanitizeSensitive,
	sensitiveDataRules,
} from "./sensitive-data";

describe("sensitive data rules", () => {
	test("masks CPF preserving last 4 digits", () => {
		const result = sanitizeSensitive("CPF 123.456.789-00");
		expect(result.value).toBe("CPF CPF **********9-00");
		expect(result.detected).toBe(true);
		expect(result.matchedRuleIds).toContain("cpf");
	});

	test("masks card numbers and long digit runs", () => {
		expect(maskSensitive("Compra 1234 5678 9012 3456 mercado")).toBe(
			"Compra ************3456 mercado",
		);
		expect(maskSensitive("doc 1234 card 1234567890")).toBe(
			"doc 1234 card ******7890",
		);
	});

	test("masks credentials regardless of separator", () => {
		expect(maskSensitive("login senha=hunter2 token: abc")).toBe(
			"login senha: *** token: ***",
		);
		expect(maskSensitive("api_key=xyz")).toBe("api_key: ***");
	});

	test("returns matched rule ids for telemetry", () => {
		const result = sanitizeSensitive("token: 123456 cpf 111.222.333-44");
		expect(result.matchedRuleIds.includes("cpf")).toBe(true);
		expect(result.matchedRuleIds.includes("credentials")).toBe(true);
	});

	test("leaves harmless text untouched", () => {
		const result = sanitizeSensitive("Padaria do Zé");
		expect(result.value).toBe("Padaria do Zé");
		expect(result.detected).toBe(false);
	});

	test("has documented examples that match implementation", () => {
		for (const rule of sensitiveDataRules) {
			expect(maskSensitive(rule.example.input)).toBe(rule.example.output);
		}
	});
});

describe("schema column guard", () => {
	test("no finance_app_* table stores credential-like columns", () => {
		const offenders: string[] = [];
		for (const value of Object.values(schema)) {
			if (!is(value, PgTable)) continue;
			const tableName = getTableName(value as PgTable);
			if (!tableName.startsWith("finance_app_")) continue;
			const columns = getTableColumns(value as PgTable);
			for (const [key, column] of Object.entries(columns)) {
				const candidates = [key, column.name];
				for (const name of candidates) {
					for (const pattern of forbiddenColumnPatterns) {
						if (pattern.test(name)) {
							offenders.push(`${tableName}.${column.name}`);
						}
					}
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
