import { describe, expect, test } from "bun:test";

import { matchImportCategoryRule } from "./import-category-rules";

const base = {
	action: "categorize" as const,
	categoryId: 1 as number | null,
	accountId: null,
	movementType: "expense" as const,
	normalizedDescription: "",
	textMatchMode: "contains" as const,
	amountCents: null,
	amountToleranceCents: null,
	descriptionOverride: null as string | null,
	priority: 0,
	createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("import category rules", () => {
	test("requires every filled criterion to match", () => {
		const rule = {
			...base,
			id: 1,
			accountId: 10,
			normalizedDescription: "mercado",
			amountCents: 1000,
			amountToleranceCents: 200,
		};
		expect(
			matchImportCategoryRule(
				{
					accountId: 10,
					movementType: "expense",
					normalizedDescription: "mercado x",
					amountCents: 1200,
				},
				[rule],
			)?.id,
		).toBe(1);
		expect(
			matchImportCategoryRule(
				{
					accountId: 10,
					movementType: "expense",
					normalizedDescription: "mercado x",
					amountCents: 1201,
				},
				[rule],
			),
		).toBe(null);
		expect(
			matchImportCategoryRule(
				{
					accountId: 10,
					movementType: "income",
					normalizedDescription: "mercado x",
					amountCents: 1000,
				},
				[rule],
			),
		).toBe(null);
		expect(
			matchImportCategoryRule(
				{
					accountId: 11,
					movementType: "expense",
					normalizedDescription: "mercado x",
					amountCents: 1000,
				},
				[rule],
			),
		).toBe(null);
	});

	test("supports contains and exact text modes", () => {
		const contains = { ...base, id: 1, normalizedDescription: "posto" };
		const exact = {
			...base,
			id: 2,
			textMatchMode: "exact" as const,
			normalizedDescription: "posto shell",
		};
		expect(
			matchImportCategoryRule(
				{
					accountId: 1,
					movementType: "expense",
					normalizedDescription: "posto shell",
					amountCents: 5000,
				},
				[contains, exact],
			)?.id,
		).toBe(2);
		expect(
			matchImportCategoryRule(
				{
					accountId: 1,
					movementType: "expense",
					normalizedDescription: "posto shell norte",
					amountCents: 5000,
				},
				[exact],
			),
		).toBe(null);
	});

	test("resolves conflicts by specificity, priority, newest", () => {
		const oldRule = {
			...base,
			id: 1,
			normalizedDescription: "ifood",
			priority: 10,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};
		const newRule = {
			...base,
			id: 2,
			normalizedDescription: "ifood",
			priority: 10,
			createdAt: new Date("2026-02-01T00:00:00Z"),
		};
		const specific = {
			...base,
			id: 3,
			normalizedDescription: "ifood restaurante",
			priority: 0,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};
		const row = {
			accountId: 1,
			movementType: "expense" as const,
			normalizedDescription: "ifood restaurante",
			amountCents: 4200,
		};
		expect(matchImportCategoryRule(row, [oldRule, newRule])?.id).toBe(2);
		expect(matchImportCategoryRule(row, [newRule, specific])?.id).toBe(3);
	});

	test("ignore rule wins over a categorize rule matching the same row", () => {
		const categorize = {
			...base,
			id: 1,
			normalizedDescription: "ifood restaurante especifico",
			priority: 100,
		};
		const ignore = {
			...base,
			id: 2,
			action: "ignore" as const,
			categoryId: null,
			normalizedDescription: "ifood",
			priority: 0,
		};
		const row = {
			accountId: 1,
			movementType: "expense" as const,
			normalizedDescription: "ifood restaurante especifico",
			amountCents: 4200,
		};
		expect(matchImportCategoryRule(row, [categorize, ignore])?.id).toBe(2);
	});

	test("preserves descriptionOverride on the returned match", () => {
		const rule = {
			...base,
			id: 99,
			normalizedDescription: "mercado",
			descriptionOverride: "Supermercado mensal",
		};
		const match = matchImportCategoryRule(
			{
				accountId: 1,
				movementType: "expense",
				normalizedDescription: "mercado x",
				amountCents: 1000,
			},
			[rule],
		);
		expect(match?.descriptionOverride).toBe("Supermercado mensal");
	});

	test("ignore rule with null movementType matches both income and expense", () => {
		const ignore = {
			...base,
			id: 1,
			action: "ignore" as const,
			categoryId: null,
			movementType: null,
			normalizedDescription: "rendimento poupanca",
		};
		expect(
			matchImportCategoryRule(
				{
					accountId: 1,
					movementType: "income",
					normalizedDescription: "rendimento poupanca pagamento",
					amountCents: 5,
				},
				[ignore],
			)?.id,
		).toBe(1);
		expect(
			matchImportCategoryRule(
				{
					accountId: 1,
					movementType: "expense",
					normalizedDescription: "rendimento poupanca taxa",
					amountCents: 5,
				},
				[ignore],
			)?.id,
		).toBe(1);
	});
});
