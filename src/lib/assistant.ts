import {
	type ImportCategoryRule,
	matchImportCategoryRule,
} from "./import-category-rules";
import {
	maskSensitive,
	normalizeDescription as normalizeDescriptionForImport,
} from "./import-rules";

export type SuggestionKind =
	| "category_for_transaction"
	| "category_rule"
	| "anomaly"
	| "savings_opportunity";

export type CategoryForTransactionPayload = {
	transactionId: number;
	categoryId: number;
	categoryName: string;
	ruleId: number | null;
	exampleDescription: string;
	occurrencesObserved?: number;
};

export type CategoryRulePayload = {
	normalizedDescription: string;
	exampleDescription: string;
	movementType: "income" | "expense";
	categoryId: number;
	categoryName: string;
	occurrenceCount: number;
	sampleTransactionIds: number[];
};

export type AnomalyPayload = {
	monthKey: string;
	categoryId: number;
	categoryName: string;
	groupName: string;
	currentCents: number;
	meanCents: number;
	stddevCents: number;
	thresholdCents: number;
};

export type SavingsOpportunityPayload = {
	key: string;
	label: string;
	amountCents: number;
	sources: ("subscription" | "grower" | "small_recurring")[];
};

export type SuggestionPayload =
	| { kind: "category_for_transaction"; payload: CategoryForTransactionPayload }
	| { kind: "category_rule"; payload: CategoryRulePayload }
	| { kind: "anomaly"; payload: AnomalyPayload }
	| { kind: "savings_opportunity"; payload: SavingsOpportunityPayload };

export type Suggestion =
	| {
			kind: "category_for_transaction";
			fingerprint: string;
			reason: string;
			payload: CategoryForTransactionPayload;
	  }
	| {
			kind: "category_rule";
			fingerprint: string;
			reason: string;
			payload: CategoryRulePayload;
	  }
	| {
			kind: "anomaly";
			fingerprint: string;
			reason: string;
			payload: AnomalyPayload;
	  }
	| {
			kind: "savings_opportunity";
			fingerprint: string;
			reason: string;
			payload: SavingsOpportunityPayload;
	  };

export type AssistantTransaction = {
	id: number;
	accountId: number;
	categoryId: number | null;
	movementType: "income" | "expense" | string;
	status: string;
	isArchived: boolean;
	amountCents: number;
	occurredOn: string;
	description: string;
	originalDescription: string | null;
};

export type RuleCategoryHistoryEntry = {
	normalizedDescription: string;
	movementType: "income" | "expense";
	categoryId: number;
	count: number;
};

export type AssistantCategory = {
	id: number;
	groupId: number;
	name: string;
	kind: "income" | "expense";
};

const minSimilarityCount = 2;
const minRulePatternCount = 3;

// Fingerprints --------------------------------------------------------------

export function fingerprintFor(input: SuggestionPayload): string {
	switch (input.kind) {
		case "category_for_transaction":
			return `category_for_transaction:tx:${input.payload.transactionId}`;
		case "category_rule":
			return [
				"category_rule",
				input.payload.movementType,
				input.payload.categoryId,
				input.payload.normalizedDescription,
			].join(":");
		case "anomaly":
			return `anomaly:${input.payload.monthKey}:cat:${input.payload.categoryId}`;
		case "savings_opportunity":
			return `savings_opportunity:${input.payload.key}`;
	}
}

// Category suggestion for transactions --------------------------------------

export function suggestCategoryForTransactions(input: {
	transactions: AssistantTransaction[];
	categories: AssistantCategory[];
	rules: ImportCategoryRule[];
	history: RuleCategoryHistoryEntry[];
}): Suggestion[] {
	const categoriesById = new Map(input.categories.map((c) => [c.id, c]));
	const historyIndex = indexHistory(input.history);
	const suggestions: Suggestion[] = [];

	for (const tx of input.transactions) {
		if (tx.isArchived || tx.status !== "confirmed") continue;
		if (tx.categoryId !== null) continue;
		if (tx.movementType !== "income" && tx.movementType !== "expense") continue;

		const normalized = normalizeDescriptionForImport(
			tx.description || tx.originalDescription || "",
		);
		if (!normalized) continue;

		const ruleMatch = matchImportCategoryRule(
			{
				accountId: tx.accountId,
				movementType: tx.movementType,
				normalizedDescription: normalized,
				amountCents: tx.amountCents,
			},
			input.rules,
		);

		const exampleDescription = maskSensitive(
			tx.description || tx.originalDescription || "",
		);

		if (ruleMatch) {
			if (ruleMatch.action === "ignore" || ruleMatch.categoryId === null) {
				// Ignore rules pre-empt category suggestions; the user already told us
				// to skip this kind of row.
				continue;
			}
			const category = categoriesById.get(ruleMatch.categoryId);
			if (!category || category.kind !== tx.movementType) continue;
			const payload: CategoryForTransactionPayload = {
				transactionId: tx.id,
				categoryId: category.id,
				categoryName: category.name,
				ruleId: ruleMatch.id,
				exampleDescription,
			};
			suggestions.push({
				kind: "category_for_transaction",
				fingerprint: fingerprintFor({
					kind: "category_for_transaction",
					payload,
				}),
				reason: `Sugerido pela regra existente "${category.name}".`,
				payload,
			});
			continue;
		}

		const historyMatch = lookupHistory(
			historyIndex,
			normalized,
			tx.movementType,
		);
		if (!historyMatch) continue;
		const category = categoriesById.get(historyMatch.categoryId);
		if (!category || category.kind !== tx.movementType) continue;

		const payload: CategoryForTransactionPayload = {
			transactionId: tx.id,
			categoryId: category.id,
			categoryName: category.name,
			ruleId: null,
			exampleDescription,
			occurrencesObserved: historyMatch.count,
		};
		suggestions.push({
			kind: "category_for_transaction",
			fingerprint: fingerprintFor({
				kind: "category_for_transaction",
				payload,
			}),
			reason: `Categoria mais usada para descrições similares (${historyMatch.count}x): "${category.name}".`,
			payload,
		});
	}

	return suggestions;
}

// Category rule suggestion --------------------------------------------------

export function suggestCategoryRules(input: {
	transactions: AssistantTransaction[];
	categories: AssistantCategory[];
	existingRules: ImportCategoryRule[];
}): Suggestion[] {
	const categoriesById = new Map(input.categories.map((c) => [c.id, c]));
	type Bucket = {
		normalizedDescription: string;
		movementType: "income" | "expense";
		categoryId: number;
		exampleDescription: string;
		transactionIds: number[];
	};
	const buckets = new Map<string, Bucket>();

	for (const tx of input.transactions) {
		if (tx.isArchived || tx.status !== "confirmed") continue;
		if (tx.categoryId === null) continue;
		if (tx.movementType !== "income" && tx.movementType !== "expense") continue;
		const normalized = normalizeDescriptionForImport(
			tx.description || tx.originalDescription || "",
		);
		if (!normalized) continue;
		const key = `${tx.movementType}:${tx.categoryId}:${normalized}`;
		const bucket = buckets.get(key) ?? {
			normalizedDescription: normalized,
			movementType: tx.movementType,
			categoryId: tx.categoryId,
			exampleDescription: maskSensitive(
				tx.description || tx.originalDescription || "",
			),
			transactionIds: [],
		};
		bucket.transactionIds.push(tx.id);
		buckets.set(key, bucket);
	}

	// Drop any bucket whose normalizedDescription has divergent categories
	const conflicting = new Set<string>();
	const byDescAndType = new Map<string, Set<number>>();
	for (const bucket of buckets.values()) {
		const k = `${bucket.movementType}:${bucket.normalizedDescription}`;
		const set = byDescAndType.get(k) ?? new Set<number>();
		set.add(bucket.categoryId);
		byDescAndType.set(k, set);
	}
	for (const [k, set] of byDescAndType) {
		if (set.size > 1) conflicting.add(k);
	}

	const suggestions: Suggestion[] = [];
	for (const bucket of buckets.values()) {
		if (bucket.transactionIds.length < minRulePatternCount) continue;
		if (
			conflicting.has(`${bucket.movementType}:${bucket.normalizedDescription}`)
		) {
			continue;
		}
		const category = categoriesById.get(bucket.categoryId);
		if (!category || category.kind !== bucket.movementType) continue;
		if (
			input.existingRules.some(
				(rule) =>
					rule.movementType === bucket.movementType &&
					rule.categoryId === bucket.categoryId &&
					ruleCoversNormalized(rule, bucket.normalizedDescription),
			)
		) {
			continue;
		}

		const payload: CategoryRulePayload = {
			normalizedDescription: bucket.normalizedDescription,
			exampleDescription: bucket.exampleDescription,
			movementType: bucket.movementType,
			categoryId: bucket.categoryId,
			categoryName: category.name,
			occurrenceCount: bucket.transactionIds.length,
			sampleTransactionIds: bucket.transactionIds.slice(0, 5),
		};
		suggestions.push({
			kind: "category_rule",
			fingerprint: fingerprintFor({ kind: "category_rule", payload }),
			reason: `${bucket.transactionIds.length} transações com descrição similar foram categorizadas como "${category.name}".`,
			payload,
		});
	}

	return suggestions;
}

function ruleCoversNormalized(
	rule: ImportCategoryRule,
	normalizedDescription: string,
) {
	if (rule.textMatchMode === "exact") {
		return rule.normalizedDescription === normalizedDescription;
	}
	return normalizedDescription.includes(rule.normalizedDescription);
}

// Anomaly suggestions -------------------------------------------------------

export function buildAnomalySuggestions(input: {
	period: { key: string };
	anomalies: {
		categoryId: number;
		categoryName: string;
		groupName: string;
		currentCents: number;
		meanCents: number;
		stddevCents: number;
		thresholdCents: number;
	}[];
}): Suggestion[] {
	return input.anomalies.map((row) => {
		const payload: AnomalyPayload = {
			monthKey: input.period.key,
			categoryId: row.categoryId,
			categoryName: row.categoryName,
			groupName: row.groupName,
			currentCents: row.currentCents,
			meanCents: row.meanCents,
			stddevCents: row.stddevCents,
			thresholdCents: row.thresholdCents,
		};
		return {
			kind: "anomaly",
			fingerprint: fingerprintFor({ kind: "anomaly", payload }),
			reason: `Gasto em "${row.categoryName}" está acima do padrão histórico (${formatCents(row.currentCents)} contra média ${formatCents(row.meanCents)}).`,
			payload,
		};
	});
}

// Savings opportunity suggestions -------------------------------------------

export function buildSavingsOpportunitySuggestions(input: {
	opportunities: {
		key: string;
		label: string;
		amountCents: number;
		sources: SavingsOpportunityPayload["sources"];
	}[];
}): Suggestion[] {
	return input.opportunities.map((row) => {
		const payload: SavingsOpportunityPayload = {
			key: row.key,
			label: maskSensitive(row.label),
			amountCents: row.amountCents,
			sources: row.sources,
		};
		return {
			kind: "savings_opportunity",
			fingerprint: fingerprintFor({
				kind: "savings_opportunity",
				payload,
			}),
			reason: opportunityReason(row.sources, payload.label, row.amountCents),
			payload,
		};
	});
}

function opportunityReason(
	sources: SavingsOpportunityPayload["sources"],
	label: string,
	amountCents: number,
) {
	const parts: string[] = [];
	if (sources.includes("subscription")) parts.push("assinatura para revisar");
	if (sources.includes("grower")) parts.push("categoria em alta");
	if (sources.includes("small_recurring"))
		parts.push("pequenos recorrentes que somam");
	const why = parts.length > 0 ? parts.join(", ") : "oportunidade";
	return `Possível economia em "${label}" (${formatCents(amountCents)}): ${why}.`;
}

// Summaries -----------------------------------------------------------------

export type SummaryTheme =
	| "monthly"
	| "income"
	| "expense"
	| "accounts"
	| "budget"
	| "cash_flow";

export type AssistantSummary = {
	theme: SummaryTheme;
	title: string;
	bullets: string[];
};

export function summarizeMonthly(input: {
	period: { key: string };
	totals: { incomeCents: number; expenseCents: number; netCents: number };
	previousNet: number | null;
	pendingReviewCount: number;
	uncategorizedCount: number;
	openInvoicesCents: number;
	alertsCount: number;
}): AssistantSummary {
	const bullets: string[] = [];
	bullets.push(
		`Receitas: ${formatCents(input.totals.incomeCents)}; despesas: ${formatCents(input.totals.expenseCents)}; saldo do mês: ${formatCents(input.totals.netCents)}.`,
	);
	if (input.previousNet !== null) {
		const delta = input.totals.netCents - input.previousNet;
		const direction = delta >= 0 ? "melhor" : "pior";
		bullets.push(
			`Saldo ${direction} que o mês anterior em ${formatCents(Math.abs(delta))}.`,
		);
	}
	if (input.openInvoicesCents > 0) {
		bullets.push(
			`Faturas abertas somam ${formatCents(input.openInvoicesCents)}.`,
		);
	}
	if (input.pendingReviewCount > 0) {
		bullets.push(
			`${input.pendingReviewCount} importações aguardam revisão antes de virarem transações.`,
		);
	}
	if (input.uncategorizedCount > 0) {
		bullets.push(
			`${input.uncategorizedCount} transações sem categoria precisam de revisão.`,
		);
	}
	if (input.alertsCount > 0) {
		bullets.push(`${input.alertsCount} alertas exigem atenção.`);
	}
	return { theme: "monthly", title: "Resumo do mês", bullets };
}

export function summarizeIncome(input: {
	period: { key: string };
	totalIncomeCents: number;
	previousIncomeCents: number | null;
	topCategories: { categoryName: string; amountCents: number }[];
}): AssistantSummary {
	const bullets: string[] = [];
	bullets.push(`Total de receitas: ${formatCents(input.totalIncomeCents)}.`);
	if (input.previousIncomeCents !== null) {
		const delta = input.totalIncomeCents - input.previousIncomeCents;
		const direction = delta >= 0 ? "acima" : "abaixo";
		bullets.push(
			`${direction.charAt(0).toUpperCase()}${direction.slice(1)} do mês anterior em ${formatCents(Math.abs(delta))}.`,
		);
	}
	if (input.topCategories.length > 0) {
		const labels = input.topCategories
			.slice(0, 3)
			.map((row) => `${row.categoryName} (${formatCents(row.amountCents)})`)
			.join(", ");
		bullets.push(`Principais fontes: ${labels}.`);
	} else {
		bullets.push("Nenhuma receita registrada no período.");
	}
	return { theme: "income", title: "Resumo das receitas", bullets };
}

export function summarizeExpenses(input: {
	period: { key: string };
	totalExpenseCents: number;
	previousExpenseCents: number | null;
	topCategories: { categoryName: string; amountCents: number }[];
	uncategorizedCount: number;
	uncategorizedCents: number;
}): AssistantSummary {
	const bullets: string[] = [];
	bullets.push(`Total de despesas: ${formatCents(input.totalExpenseCents)}.`);
	if (input.previousExpenseCents !== null) {
		const delta = input.totalExpenseCents - input.previousExpenseCents;
		const direction = delta >= 0 ? "acima" : "abaixo";
		bullets.push(
			`${direction.charAt(0).toUpperCase()}${direction.slice(1)} do mês anterior em ${formatCents(Math.abs(delta))}.`,
		);
	}
	if (input.topCategories.length > 0) {
		const labels = input.topCategories
			.slice(0, 3)
			.map((row) => `${row.categoryName} (${formatCents(row.amountCents)})`)
			.join(", ");
		bullets.push(`Maiores categorias: ${labels}.`);
	}
	if (input.uncategorizedCount > 0) {
		bullets.push(
			`${input.uncategorizedCount} transações sem categoria somam ${formatCents(input.uncategorizedCents)}.`,
		);
	}
	return { theme: "expense", title: "Resumo das despesas", bullets };
}

export function summarizeAccounts(input: {
	consolidatedCents: number;
	cardDebtCents: number;
	openInvoicesCents: number;
	accountCount: number;
	cardCount: number;
	lowBalanceAccounts: string[];
}): AssistantSummary {
	const bullets: string[] = [];
	bullets.push(
		`Saldo consolidado: ${formatCents(input.consolidatedCents)} em ${input.accountCount} contas.`,
	);
	if (input.cardCount > 0) {
		bullets.push(
			`Cartões: ${input.cardCount}, dívida atual ${formatCents(input.cardDebtCents)}, faturas em aberto ${formatCents(input.openInvoicesCents)}.`,
		);
	}
	if (input.lowBalanceAccounts.length > 0) {
		bullets.push(
			`Atenção em contas com saldo baixo: ${input.lowBalanceAccounts.join(", ")}.`,
		);
	} else {
		bullets.push("Nenhuma conta com saldo crítico no momento.");
	}
	return { theme: "accounts", title: "Resumo de contas e cartões", bullets };
}

export function summarizeBudget(input: {
	period: { key: string };
	usage: {
		name: string;
		percent: number;
		status: "ok" | "near" | "over";
		plannedCents: number;
		spentCents: number;
	}[];
}): AssistantSummary {
	const bullets: string[] = [];
	const over = input.usage.filter((u) => u.status === "over");
	const near = input.usage.filter((u) => u.status === "near");
	if (input.usage.length === 0) {
		bullets.push("Nenhum orçamento definido para este mês.");
	} else {
		bullets.push(`${input.usage.length} orçamentos acompanhados no mês.`);
	}
	if (over.length > 0) {
		bullets.push(
			`${over.length} acima do limite: ${over
				.map((u) => `${u.name} (${formatPercentValue(u.percent)})`)
				.join(", ")}.`,
		);
	}
	if (near.length > 0) {
		bullets.push(
			`${near.length} próximos do limite: ${near
				.map((u) => `${u.name} (${formatPercentValue(u.percent)})`)
				.join(", ")}.`,
		);
	}
	if (over.length === 0 && near.length === 0 && input.usage.length > 0) {
		bullets.push("Nenhum orçamento estourado ou próximo do limite.");
	}
	return { theme: "budget", title: "Resumo de orçamento", bullets };
}

export function summarizeCashFlow(input: {
	projectedConsolidatedCents: number;
	realizedNetCents: number;
	plannedNetCents: number;
	negativeAlerts: { accountName: string; lowestCents: number }[];
	upcomingInvoiceCents: number;
}): AssistantSummary {
	const bullets: string[] = [];
	bullets.push(
		`Saldo projetado consolidado: ${formatCents(input.projectedConsolidatedCents)}.`,
	);
	bullets.push(
		`Realizado no mês: ${formatCents(input.realizedNetCents)}; previsto restante: ${formatCents(input.plannedNetCents)}.`,
	);
	if (input.upcomingInvoiceCents > 0) {
		bullets.push(
			`Faturas futuras impactarão ${formatCents(input.upcomingInvoiceCents)}.`,
		);
	}
	if (input.negativeAlerts.length > 0) {
		const list = input.negativeAlerts
			.map((a) => `${a.accountName} (${formatCents(a.lowestCents)})`)
			.join(", ");
		bullets.push(`Risco de saldo negativo: ${list}.`);
	} else {
		bullets.push("Sem risco projetado de saldo negativo no horizonte.");
	}
	return { theme: "cash_flow", title: "Resumo de fluxo de caixa", bullets };
}

// Provider ------------------------------------------------------------------

export type AssistantProvider = {
	generateSuggestions(input: {
		period: { key: string };
		transactions: AssistantTransaction[];
		categories: AssistantCategory[];
		rules: ImportCategoryRule[];
		history: RuleCategoryHistoryEntry[];
		anomalies: Parameters<typeof buildAnomalySuggestions>[0]["anomalies"];
		opportunities: Parameters<
			typeof buildSavingsOpportunitySuggestions
		>[0]["opportunities"];
	}): Suggestion[];
};

export const heuristicAssistant: AssistantProvider = {
	generateSuggestions(input) {
		return [
			...suggestCategoryForTransactions({
				transactions: input.transactions,
				categories: input.categories,
				rules: input.rules,
				history: input.history,
			}),
			...suggestCategoryRules({
				transactions: input.transactions,
				categories: input.categories,
				existingRules: input.rules,
			}),
			...buildAnomalySuggestions({
				period: input.period,
				anomalies: input.anomalies,
			}),
			...buildSavingsOpportunitySuggestions({
				opportunities: input.opportunities,
			}),
		];
	},
};

// History helpers -----------------------------------------------------------

export function buildHistoryFromTransactions(
	transactions: AssistantTransaction[],
): RuleCategoryHistoryEntry[] {
	const counts = new Map<string, RuleCategoryHistoryEntry>();
	for (const tx of transactions) {
		if (tx.isArchived || tx.status !== "confirmed") continue;
		if (tx.categoryId === null) continue;
		if (tx.movementType !== "income" && tx.movementType !== "expense") continue;
		const normalized = normalizeDescriptionForImport(
			tx.description || tx.originalDescription || "",
		);
		if (!normalized) continue;
		const key = `${tx.movementType}:${normalized}:${tx.categoryId}`;
		const entry = counts.get(key) ?? {
			normalizedDescription: normalized,
			movementType: tx.movementType,
			categoryId: tx.categoryId,
			count: 0,
		};
		entry.count++;
		counts.set(key, entry);
	}
	return [...counts.values()];
}

function indexHistory(entries: RuleCategoryHistoryEntry[]) {
	const map = new Map<string, RuleCategoryHistoryEntry[]>();
	for (const entry of entries) {
		const key = `${entry.movementType}:${entry.normalizedDescription}`;
		const list = map.get(key) ?? [];
		list.push(entry);
		map.set(key, list);
	}
	return map;
}

function lookupHistory(
	index: Map<string, RuleCategoryHistoryEntry[]>,
	normalized: string,
	movementType: "income" | "expense",
): RuleCategoryHistoryEntry | null {
	const exact = index.get(`${movementType}:${normalized}`) ?? [];
	const candidates: RuleCategoryHistoryEntry[] = [...exact];
	for (const [key, list] of index) {
		if (!key.startsWith(`${movementType}:`)) continue;
		const value = key.slice(movementType.length + 1);
		if (value === normalized) continue;
		if (normalized.includes(value) || value.includes(normalized)) {
			candidates.push(...list);
		}
	}
	if (candidates.length === 0) return null;
	const totals = new Map<number, number>();
	for (const entry of candidates) {
		totals.set(
			entry.categoryId,
			(totals.get(entry.categoryId) ?? 0) + entry.count,
		);
	}
	let bestId: number | null = null;
	let bestCount = 0;
	for (const [id, count] of totals) {
		if (count > bestCount) {
			bestId = id;
			bestCount = count;
		}
	}
	if (bestId === null || bestCount < minSimilarityCount) return null;
	return {
		normalizedDescription: normalized,
		movementType,
		categoryId: bestId,
		count: bestCount,
	};
}

// Formatting helpers --------------------------------------------------------

function formatCents(cents: number) {
	return new Intl.NumberFormat("pt-BR", {
		currency: "BRL",
		style: "currency",
	}).format(cents / 100);
}

function formatPercentValue(value: number) {
	return new Intl.NumberFormat("pt-BR", {
		maximumFractionDigits: 0,
		style: "percent",
	}).format(value);
}
