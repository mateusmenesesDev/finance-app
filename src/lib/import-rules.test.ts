import { describe, expect, test } from "bun:test";

import {
	defaultTemplateConfig,
	duplicateKey,
	maskSensitive,
	normalizeDescription,
	parseImportCsv,
} from "./import-rules";

const signedTemplate = {
	...defaultTemplateConfig,
	categoryColumn: "categoria",
};
const kindTemplate = {
	...defaultTemplateConfig,
	kindColumn: "tipo",
};
const separateTemplate = {
	...defaultTemplateConfig,
	amountMode: "separate" as const,
	amountColumn: undefined,
	incomeAmountColumn: "entrada",
	expenseAmountColumn: "saida",
};

describe("import rules", () => {
	test("parses generic signed CSV without storing raw sensitive text", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor;categoria\n05/05/2026;COMPRA CARTAO 1234567890123456;-12,34;Mercado 987654321\n",
			signedTemplate,
		);

		expect({
			occurredOn: row?.occurredOn,
			amountCents: row?.amountCents,
			movementType: row?.movementType,
			originalDescription: row?.originalDescription,
			bankCategory: row?.bankCategory,
			validationError: row?.validationError,
			hadSensitiveData: row?.hadSensitiveData,
		}).toEqual({
			occurredOn: "2026-05-05",
			amountCents: 1234,
			movementType: "expense",
			originalDescription: "COMPRA CARTAO ************3456",
			bankCategory: "Mercado *****4321",
			validationError: null,
			hadSensitiveData: true,
		});
	});

	test("parses explicit kind template for positive expenses", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor;tipo\n05/05/2026;Padaria;12,34;debito\n",
			kindTemplate,
		);

		expect(row?.amountCents).toBe(1234);
		expect(row?.movementType).toBe("expense");
	});

	test("parses separate income and expense columns", () => {
		const rows = parseImportCsv(
			"data;descricao;entrada;saida\n05/05/2026;Salario;1000,00;\n06/05/2026;Mercado;;123,45\n",
			separateTemplate,
		);

		expect(rows.map((row) => [row.amountCents, row.movementType])).toEqual([
			[100000, "income"],
			[12345, "expense"],
		]);
	});

	test("reports invalid rows instead of inventing data", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor\n31/02/2026;;abc\n",
			signedTemplate,
		);

		expect(row?.validationError?.includes("data inválida")).toBe(true);
		expect(row?.validationError?.includes("valor inválido")).toBe(true);
		expect(row?.validationError?.includes("descrição obrigatória")).toBe(true);
	});

	test("rejects amounts above int32 max as invalid (no scientific-notation insert)", () => {
		const rows = parseImportCsv(
			[
				"data;descricao;valor",
				"05/05/2026;Excel scientific;6.9E+24",
				"05/05/2026;Many separators;6.900.000.000.000.000.000.000.000,00",
				"05/05/2026;At the int32 ceiling;21474836,47",
				"05/05/2026;One cent above the ceiling;21474836,48",
			].join("\n"),
			signedTemplate,
		);

		expect(rows[0]?.amountCents).toBe(null);
		expect(rows[0]?.validationError?.includes("valor inválido")).toBe(true);
		expect(rows[1]?.amountCents).toBe(null);
		expect(rows[1]?.validationError?.includes("valor inválido")).toBe(true);
		expect(rows[2]?.amountCents).toBe(2_147_483_647);
		expect(rows[2]?.validationError).toBe(null);
		expect(rows[3]?.amountCents).toBe(null);
		expect(rows[3]?.validationError?.includes("valor inválido")).toBe(true);
	});

	test("normalizes duplicate keys with masked long numbers", () => {
		const left = duplicateKey({
			accountId: 1,
			occurredOn: "2026-05-05",
			amountCents: 999,
			movementType: "expense",
			normalizedDescription: normalizeDescription("PIX 123456789 Ana"),
		});
		const right = duplicateKey({
			accountId: 1,
			occurredOn: "2026-05-05",
			amountCents: 999,
			movementType: "expense",
			normalizedDescription: normalizeDescription("pix 987654321 ana"),
		});

		expect(left).toBe(right);
	});

	test("masks long digit runs and secret-like labels", () => {
		expect(maskSensitive("doc 1234 card 1234567890 senha abc123")).toBe(
			"doc 1234 card ******7890 senha: ***",
		);
	});
});
