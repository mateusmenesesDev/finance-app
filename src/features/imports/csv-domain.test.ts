import { describe, expect, test } from "bun:test";

import {
	defaultTemplateConfig,
	duplicateKey,
	maskSensitive,
	normalizeDescription,
	normalizeImportTemplateConfig,
	parseImportCsv,
} from "./csv-domain";

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

	test("parses accented comma CSV headers with signed dot-decimal amount", () => {
		const [row] = parseImportCsv(
			"Data,Valor,Identificador,Descrição\n05/05/2026,-50.00,69f00000-0000-4000-8000-000000000000,Padaria\n",
			defaultTemplateConfig,
		);

		expect(row?.amountCents).toBe(5000);
		expect(row?.movementType).toBe("expense");
		expect(row?.originalDescription).toBe("Padaria");
		expect(row?.validationError).toBe(null);
	});

	test("rejects UUID prefixes in mapped amount column instead of inventing money", () => {
		const [row] = parseImportCsv(
			"Data,Valor,Identificador,Descrição\n05/05/2026,-50.00,69f00000-0000-4000-8000-000000000000,Padaria\n",
			{
				...defaultTemplateConfig,
				descriptionColumn: "Valor",
				amountColumn: "Identificador",
			},
		);

		expect(row?.originalDescription).toBe("-50.00");
		expect(row?.amountCents).toBe(null);
		expect(row?.movementType).toBe(null);
		expect(row?.validationError).toContain("valor inválido");
	});

	test("parses explicit kind template for positive expenses", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor;tipo\n05/05/2026;Padaria;12,34;debito\n",
			kindTemplate,
		);

		expect(row?.amountCents).toBe(1234);
		expect(row?.movementType).toBe("expense");
		expect(row?.validationError).toBe(null);
	});

	test("defaults negative signed rows to expenses before kind tokens", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor;tipo\n05/05/2026;Cartao;-12,34;credito\n",
			kindTemplate,
		);

		expect(row?.amountCents).toBe(1234);
		expect(row?.movementType).toBe("expense");
		expect(row?.validationError).toBe(null);
	});

	test("uses inverted signed amount to default negative rows as expenses", () => {
		const [row] = parseImportCsv(
			"data;descricao;valor;tipo\n05/05/2026;Cartao;12,34;credito\n",
			{ ...kindTemplate, invertSign: true },
		);

		expect(row?.amountCents).toBe(1234);
		expect(row?.movementType).toBe("expense");
		expect(row?.validationError).toBe(null);
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

	test("normalizes template config without trusting malformed optional fields", () => {
		const config = normalizeImportTemplateConfig({
			delimiter: "tab",
			dateFormat: "mm/dd/yyyy",
			decimalSeparator: "x",
			amountMode: "separate",
			dateColumn: "  Data lançamento  ",
			descriptionColumn: "",
			amountColumn: " valor ignorado ",
			incomeTokens: ["  crédito ", "", 42],
			expenseTokens: [],
			invertSign: "yes",
		});

		expect(config).toEqual({
			...defaultTemplateConfig,
			delimiter: "auto",
			dateFormat: "dd/mm/yyyy",
			decimalSeparator: "auto",
			amountMode: "separate",
			dateColumn: "Data lançamento",
			descriptionColumn: defaultTemplateConfig.descriptionColumn,
			amountColumn: "valor ignorado",
			incomeTokens: ["crédito"],
			expenseTokens: defaultTemplateConfig.expenseTokens,
			invertSign: false,
		});
	});

	test("keeps external id in duplicate key before date and description", () => {
		const withExternalId = duplicateKey({
			accountId: 1,
			occurredOn: "2026-05-05",
			amountCents: 999,
			movementType: "expense",
			normalizedDescription: "mesma descricao",
			externalId: "ABC-123",
		});
		const withoutExternalId = duplicateKey({
			accountId: 1,
			occurredOn: "2026-05-05",
			amountCents: 999,
			movementType: "expense",
			normalizedDescription: "mesma descricao",
		});

		expect(withExternalId).not.toBe(withoutExternalId);
		expect(withExternalId).toContain("abc-123");
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
