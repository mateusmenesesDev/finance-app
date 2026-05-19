import { describe, expect, test } from "bun:test";

import {
	buildAnomalySuggestions,
	buildSavingsOpportunitySuggestions,
	fingerprintFor,
	heuristicAssistant,
	type RuleCategoryHistoryEntry,
	suggestCategoryForTransactions,
	suggestCategoryRules,
	summarizeAccounts,
	summarizeBudget,
	summarizeCashFlow,
	summarizeExpenses,
	summarizeIncome,
	summarizeMonthly,
} from "./assistant";

const categories = [
	{ id: 1, groupId: 10, name: "Mercado", kind: "expense" as const },
	{ id: 2, groupId: 20, name: "Salário", kind: "income" as const },
	{ id: 3, groupId: 10, name: "Restaurante", kind: "expense" as const },
];
const period = { key: "2025-05", start: "2025-05-01", end: "2025-05-31" };

describe("assistant fingerprint", () => {
	test("category_for_transaction depends only on transactionId", () => {
		const a = fingerprintFor({
			kind: "category_for_transaction",
			payload: {
				transactionId: 42,
				categoryId: 1,
				categoryName: "Mercado",
				ruleId: null,
				exampleDescription: "x",
			},
		});
		const b = fingerprintFor({
			kind: "category_for_transaction",
			payload: {
				transactionId: 42,
				categoryId: 99,
				categoryName: "Outra",
				ruleId: 5,
				exampleDescription: "y",
			},
		});
		expect(a).toBe(b);
		expect(a.startsWith("category_for_transaction:")).toBe(true);
	});

	test("category_rule mixes normalized description, type and category", () => {
		const a = fingerprintFor({
			kind: "category_rule",
			payload: {
				normalizedDescription: "ifood",
				movementType: "expense",
				categoryId: 1,
				exampleDescription: "iFood",
				occurrenceCount: 4,
				sampleTransactionIds: [1, 2, 3],
				categoryName: "Mercado",
			},
		});
		const b = fingerprintFor({
			kind: "category_rule",
			payload: {
				normalizedDescription: "ifood",
				movementType: "income",
				categoryId: 1,
				exampleDescription: "ifood",
				occurrenceCount: 99,
				sampleTransactionIds: [],
				categoryName: "Mercado",
			},
		});
		expect(a).not.toBe(b);
	});

	test("anomaly fingerprint depends on monthKey and categoryId only", () => {
		const a = fingerprintFor({
			kind: "anomaly",
			payload: {
				monthKey: "2025-05",
				categoryId: 1,
				categoryName: "x",
				groupName: "y",
				currentCents: 1,
				meanCents: 2,
				stddevCents: 3,
				thresholdCents: 4,
			},
		});
		const b = fingerprintFor({
			kind: "anomaly",
			payload: {
				monthKey: "2025-05",
				categoryId: 1,
				categoryName: "z",
				groupName: "w",
				currentCents: 99,
				meanCents: 88,
				stddevCents: 77,
				thresholdCents: 66,
			},
		});
		expect(a).toBe(b);
	});

	test("savings_opportunity uses the opportunity key", () => {
		const a = fingerprintFor({
			kind: "savings_opportunity",
			payload: {
				key: "subscription:42",
				label: "Netflix",
				amountCents: 5000,
				sources: ["subscription"],
			},
		});
		const b = fingerprintFor({
			kind: "savings_opportunity",
			payload: {
				key: "subscription:42",
				label: "different",
				amountCents: 99,
				sources: ["grower"],
			},
		});
		expect(a).toBe(b);
	});
});

describe("suggestCategoryForTransactions", () => {
	const tx = (overrides: Record<string, unknown>) => ({
		id: 1,
		accountId: 1,
		categoryId: null,
		movementType: "expense" as const,
		status: "confirmed" as const,
		isArchived: false,
		amountCents: 1000,
		occurredOn: "2025-05-10",
		description: "Mercado X",
		originalDescription: "MERCADO X 12345",
		...overrides,
	});

	test("uses matching rule when available", () => {
		const result = suggestCategoryForTransactions({
			transactions: [tx({ id: 1 })],
			categories,
			rules: [
				{
					id: 7,
					action: "categorize",
					categoryId: 1,
					accountId: null,
					movementType: "expense",
					normalizedDescription: "mercado",
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
					descriptionOverride: null,
					priority: 0,
					createdAt: new Date("2025-01-01"),
				},
			],
			history: [],
		});
		expect(result).toHaveLength(1);
		const [first] = result;
		if (!first || first.kind !== "category_for_transaction") {
			throw new Error("expected category_for_transaction");
		}
		expect(first.payload.categoryId).toBe(1);
		expect(first.payload.ruleId).toBe(7);
		expect(first.reason).toContain("regra");
	});

	test("falls back to most-used category in history", () => {
		const history: RuleCategoryHistoryEntry[] = [
			{
				normalizedDescription: "mercado x",
				movementType: "expense",
				categoryId: 1,
				count: 4,
			},
			{
				normalizedDescription: "mercado x",
				movementType: "expense",
				categoryId: 3,
				count: 1,
			},
		];
		const result = suggestCategoryForTransactions({
			transactions: [tx({ id: 1 })],
			categories,
			rules: [],
			history,
		});
		expect(result).toHaveLength(1);
		const [first] = result;
		if (!first || first.kind !== "category_for_transaction") {
			throw new Error("expected category_for_transaction");
		}
		expect(first.payload.categoryId).toBe(1);
		expect(first.payload.ruleId).toBe(null);
		expect(first.reason).toMatch(/categoria mais usada/i);
	});

	test("ignores transactions that already have a category", () => {
		const result = suggestCategoryForTransactions({
			transactions: [tx({ categoryId: 3 })],
			categories,
			rules: [],
			history: [
				{
					normalizedDescription: "mercado x",
					movementType: "expense",
					categoryId: 1,
					count: 4,
				},
			],
		});
		expect(result).toHaveLength(0);
	});

	test("ignores when no rule matches and no history entry exists", () => {
		const result = suggestCategoryForTransactions({
			transactions: [tx({ description: "estabelecimento sem histórico" })],
			categories,
			rules: [],
			history: [],
		});
		expect(result).toHaveLength(0);
	});

	test("never suggests a category that conflicts with movementType kind", () => {
		const result = suggestCategoryForTransactions({
			transactions: [tx({ movementType: "income", description: "salário" })],
			categories,
			rules: [],
			history: [
				{
					normalizedDescription: "salario",
					movementType: "income",
					categoryId: 1,
					count: 5,
				},
			],
		});
		expect(result).toHaveLength(0);
	});

	test("masks sensitive content in payload example description", () => {
		const result = suggestCategoryForTransactions({
			transactions: [
				tx({
					description: "pix mensal",
					originalDescription: "PIX CPF 123.456.789-00",
				}),
			],
			categories,
			rules: [],
			history: [
				{
					normalizedDescription: "pix",
					movementType: "expense",
					categoryId: 1,
					count: 5,
				},
			],
		});
		const [first] = result;
		if (!first || first.kind !== "category_for_transaction") {
			throw new Error("expected category_for_transaction");
		}
		expect(first.payload.exampleDescription.includes("123.456.789-00")).toBe(
			false,
		);
	});
});

describe("suggestCategoryRules", () => {
	const baseTx = {
		id: 0,
		accountId: 1,
		movementType: "expense" as const,
		status: "confirmed" as const,
		isArchived: false,
		amountCents: 1000,
		occurredOn: "2025-05-10",
		description: "Padaria Bom Pão",
		originalDescription: "Padaria Bom Pão",
		categoryId: 1,
	};

	test("emits a rule when 3+ transactions share normalized description and category", () => {
		const transactions = [1, 2, 3, 4].map((id) => ({ ...baseTx, id }));
		const result = suggestCategoryRules({
			transactions,
			categories,
			existingRules: [],
		});
		expect(result).toHaveLength(1);
		const [first] = result;
		if (!first || first.kind !== "category_rule") {
			throw new Error("expected category_rule");
		}
		expect(first.payload.occurrenceCount).toBe(4);
		expect(first.payload.categoryId).toBe(1);
		expect(first.payload.movementType).toBe("expense");
	});

	test("does not emit when an existing rule covers the pattern", () => {
		const transactions = [1, 2, 3].map((id) => ({ ...baseTx, id }));
		const result = suggestCategoryRules({
			transactions,
			categories,
			existingRules: [
				{
					id: 9,
					action: "categorize",
					categoryId: 1,
					accountId: null,
					movementType: "expense",
					normalizedDescription: "padaria bom pao",
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
					descriptionOverride: null,
					priority: 0,
					createdAt: new Date(),
				},
			],
		});
		expect(result).toHaveLength(0);
	});

	test("ignores transactions without a category or with mixed categories", () => {
		const transactions = [
			{ ...baseTx, id: 1 },
			{ ...baseTx, id: 2, categoryId: null },
			{ ...baseTx, id: 3, categoryId: 3 },
		];
		const result = suggestCategoryRules({
			transactions,
			categories,
			existingRules: [],
		});
		expect(result).toHaveLength(0);
	});

	test("emits one rule per (normalizedDescription, movementType, categoryId)", () => {
		const transactions = [
			...[1, 2, 3].map((id) => ({ ...baseTx, id })),
			...[4, 5, 6].map((id) => ({
				...baseTx,
				id,
				description: "Outra Coisa",
				originalDescription: "Outra Coisa",
				categoryId: 3,
			})),
		];
		const result = suggestCategoryRules({
			transactions,
			categories,
			existingRules: [],
		});
		expect(result).toHaveLength(2);
	});
});

describe("buildAnomalySuggestions", () => {
	test("emits one suggestion per anomaly row", () => {
		const result = buildAnomalySuggestions({
			period,
			anomalies: [
				{
					categoryId: 1,
					categoryName: "Mercado",
					groupName: "Alimentação",
					currentCents: 100_00,
					meanCents: 30_00,
					stddevCents: 10_00,
					thresholdCents: 50_00,
				},
			],
		});
		expect(result).toHaveLength(1);
		const [first] = result;
		if (!first) throw new Error("expected suggestion");
		expect(first.fingerprint.includes("2025-05")).toBe(true);
		expect(first.reason).toMatch(/acima/i);
	});
});

describe("buildSavingsOpportunitySuggestions", () => {
	test("emits one suggestion per opportunity using its key", () => {
		const result = buildSavingsOpportunitySuggestions({
			opportunities: [
				{
					key: "subscription:42",
					label: "Netflix",
					amountCents: 5000,
					sources: ["subscription"],
				},
				{
					key: "category:1",
					label: "Mercado",
					amountCents: 30000,
					sources: ["grower"],
				},
			],
		});
		expect(result).toHaveLength(2);
		const fingerprints = result.map((s) => s.fingerprint);
		expect(fingerprints).toEqual([
			"savings_opportunity:subscription:42",
			"savings_opportunity:category:1",
		]);
	});
});

describe("summaries", () => {
	test("monthly summary includes income, expense and net in BRL", () => {
		const summary = summarizeMonthly({
			period,
			totals: {
				incomeCents: 500_000,
				expenseCents: 320_000,
				netCents: 180_000,
			},
			previousNet: 100_000,
			pendingReviewCount: 0,
			uncategorizedCount: 0,
			openInvoicesCents: 0,
			alertsCount: 0,
		});
		expect(summary.theme).toBe("monthly");
		expect(summary.bullets.some((line) => line.includes("5.000,00"))).toBe(
			true,
		);
		expect(summary.bullets.some((line) => line.includes("3.200,00"))).toBe(
			true,
		);
		expect(summary.bullets.some((line) => line.includes("1.800,00"))).toBe(
			true,
		);
	});

	test("income summary mentions main sources", () => {
		const summary = summarizeIncome({
			period,
			totalIncomeCents: 600_000,
			previousIncomeCents: 500_000,
			topCategories: [
				{ categoryName: "Salário", amountCents: 500_000 },
				{ categoryName: "Freela", amountCents: 100_000 },
			],
		});
		expect(summary.bullets.some((line) => line.includes("Salário"))).toBe(true);
	});

	test("expense summary lists top categories", () => {
		const summary = summarizeExpenses({
			period,
			totalExpenseCents: 400_000,
			previousExpenseCents: 350_000,
			topCategories: [
				{ categoryName: "Mercado", amountCents: 200_000 },
				{ categoryName: "Restaurante", amountCents: 100_000 },
			],
			uncategorizedCount: 3,
			uncategorizedCents: 50_000,
		});
		expect(summary.bullets.some((line) => line.includes("Mercado"))).toBe(true);
		expect(summary.bullets.some((line) => line.includes("3"))).toBe(true);
	});

	test("accounts summary mentions consolidated balance and card debt", () => {
		const summary = summarizeAccounts({
			consolidatedCents: 250_000,
			cardDebtCents: 80_000,
			openInvoicesCents: 60_000,
			accountCount: 4,
			cardCount: 1,
			lowBalanceAccounts: ["Carteira"],
		});
		expect(summary.bullets.some((line) => line.includes("2.500,00"))).toBe(
			true,
		);
		expect(summary.bullets.some((line) => line.includes("Carteira"))).toBe(
			true,
		);
	});

	test("budget summary mentions over and near categories", () => {
		const summary = summarizeBudget({
			period,
			usage: [
				{
					name: "Mercado",
					percent: 1.2,
					status: "over",
					plannedCents: 100_000,
					spentCents: 120_000,
				},
				{
					name: "Restaurante",
					percent: 0.85,
					status: "near",
					plannedCents: 100_000,
					spentCents: 85_000,
				},
				{
					name: "Lazer",
					percent: 0.4,
					status: "ok",
					plannedCents: 100_000,
					spentCents: 40_000,
				},
			],
		});
		expect(summary.bullets.some((line) => line.includes("Mercado"))).toBe(true);
		expect(summary.bullets.some((line) => line.includes("Restaurante"))).toBe(
			true,
		);
	});

	test("cash flow summary highlights projected balance and risks", () => {
		const summary = summarizeCashFlow({
			projectedConsolidatedCents: 150_000,
			realizedNetCents: 90_000,
			plannedNetCents: 60_000,
			negativeAlerts: [{ accountName: "Conta Corrente", lowestCents: -20_000 }],
			upcomingInvoiceCents: 100_000,
		});
		expect(
			summary.bullets.some((line) => line.includes("Conta Corrente")),
		).toBe(true);
		expect(
			summary.bullets.some((line) => line.toLowerCase().includes("negativo")),
		).toBe(true);
	});
});

describe("heuristicAssistant", () => {
	test("aggregates suggestions and tags them", () => {
		const result = heuristicAssistant.generateSuggestions({
			period,
			transactions: [
				{
					id: 1,
					accountId: 1,
					categoryId: null,
					movementType: "expense",
					status: "confirmed",
					isArchived: false,
					amountCents: 5000,
					occurredOn: "2025-05-10",
					description: "Mercado X",
					originalDescription: "Mercado X",
				},
			],
			categories,
			rules: [
				{
					id: 7,
					action: "categorize",
					categoryId: 1,
					accountId: null,
					movementType: "expense",
					normalizedDescription: "mercado",
					textMatchMode: "contains",
					amountCents: null,
					amountToleranceCents: null,
					descriptionOverride: null,
					priority: 0,
					createdAt: new Date("2025-01-01"),
				},
			],
			history: [],
			anomalies: [],
			opportunities: [],
		});
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result[0]?.kind).toBe("category_for_transaction");
	});
});
