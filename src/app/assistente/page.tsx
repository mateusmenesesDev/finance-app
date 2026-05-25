import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { regenerateAssistantSuggestions } from "~/app/_actions/assistant-actions";
import { AssistantSuggestionCard } from "~/app/assistente/assistant-suggestion-card";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	type AssistantSummary,
	type Suggestion,
	summarizeAccounts,
	summarizeBudget,
	summarizeCashFlow,
	summarizeExpenses,
	summarizeIncome,
	summarizeMonthly,
} from "~/lib/assistant";
import {
	aggregateCashFlow,
	computeFutureInvoices,
	negativeBalanceAlerts,
	projectAccountBalances,
} from "~/lib/cash-flow";
import {
	buildBudgetUsage,
	calculateAccountBalances,
	calculateMonthlyBalanceTotals,
	getMonthPeriod,
	rankMonthlyCategories,
} from "~/lib/finance-rules";
import { formatDate, formatMoney, formatMonthLabel } from "~/lib/formatters";
import { recurrencesToPlannedMovements } from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	assistantSuggestions,
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	monthlyBudgets,
	recurrences,
	transactions,
} from "~/server/db/schema";

const lowBalanceThresholdCents = 20_000;

const kindLabels: Record<Suggestion["kind"], string> = {
	category_for_transaction: "Categorias para transações",
	category_rule: "Novas regras de categorização",
	anomaly: "Anomalias em gastos",
	savings_opportunity: "Oportunidades de economia",
};

const kindOrder: Suggestion["kind"][] = [
	"category_for_transaction",
	"category_rule",
	"anomaly",
	"savings_opportunity",
];

export default async function AssistantPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const userId = session.user.id;
	const period = getMonthPeriod();
	const today = toIsoDate(new Date());
	const cutoff =
		today >= period.start && today <= period.end ? today : period.end;

	const [
		suggestions,
		allAccounts,
		allTransactions,
		allCategories,
		allGroups,
		allRecurrences,
		confirmedOccurrences,
		batches,
		budgetRows,
	] = await Promise.all([
		db
			.select()
			.from(assistantSuggestions)
			.where(eq(assistantSuggestions.userId, userId))
			.orderBy(
				asc(assistantSuggestions.status),
				asc(assistantSuggestions.kind),
				desc(assistantSuggestions.createdAt),
			),
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId))
			.orderBy(asc(financialAccounts.name)),
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, userId))
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(asc(categories.kind), asc(categories.name)),
		db.select().from(categoryGroups).where(eq(categoryGroups.userId, userId)),
		db.select().from(recurrences).where(eq(recurrences.userId, userId)),
		db
			.select({
				recurrenceId: transactions.recurrenceId,
				occurrenceOn: transactions.recurrenceOccurrenceOn,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					isNotNull(transactions.recurrenceId),
					isNotNull(transactions.recurrenceOccurrenceOn),
				),
			),
		db.select().from(importBatches).where(eq(importBatches.userId, userId)),
		db.select().from(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
	]);

	const pending = suggestions.filter((s) => s.status === "pending");
	const decided = suggestions
		.filter((s) => s.status === "accepted" || s.status === "rejected")
		.slice(0, 12);

	const previousMonth = previousMonthPeriod(period.key);
	const previousTotals = calculateMonthlyBalanceTotals(
		allTransactions,
		allCategories,
		allGroups,
		previousMonth,
		allAccounts,
	);
	const totals = calculateMonthlyBalanceTotals(
		allTransactions,
		allCategories,
		allGroups,
		period,
		allAccounts,
	);

	const activeAccounts = allAccounts.filter((a) => !a.isArchived);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const consolidatedCents = activeAccounts.reduce(
		(sum, a) => sum + (balances.get(a.id)?.normalBalanceCents ?? 0),
		0,
	);
	const cardDebtCents = activeAccounts.reduce(
		(sum, a) => sum + (balances.get(a.id)?.cardDebtCents ?? 0),
		0,
	);
	const accountCount = activeAccounts.length;
	const cardCount = activeAccounts.filter(
		(a) => a.type === "credit_card",
	).length;
	const lowBalanceAccounts = activeAccounts
		.filter((a) => {
			const normal = balances.get(a.id)?.normalBalanceCents ?? 0;
			return (
				a.type !== "credit_card" &&
				normal > 0 &&
				normal < lowBalanceThresholdCents
			);
		})
		.map((a) => a.name);

	const openInvoices = computeFutureInvoices(
		activeAccounts,
		allTransactions,
		today,
	);
	const openInvoicesCents = openInvoices.reduce(
		(sum, inv) => sum + inv.remainingCents,
		0,
	);

	const pendingReviewBatches = batches.filter(
		(b) => b.status === "draft" || b.status === "reviewing",
	).length;
	const uncategorizedExpense = allTransactions.filter(
		(t) =>
			t.occurredOn >= period.start &&
			t.occurredOn <= period.end &&
			!t.isArchived &&
			t.status === "confirmed" &&
			t.movementType === "expense" &&
			!t.categoryId,
	);

	const incomeRanking = rankMonthlyCategories(
		allTransactions,
		allCategories,
		allGroups,
		period,
		"income",
		3,
	);
	const expenseRanking = rankMonthlyCategories(
		allTransactions,
		allCategories,
		allGroups,
		period,
		"expense",
		3,
	);

	const budgetUsage = buildBudgetUsage(
		budgetRows.filter((b) => b.monthKey === period.key),
		allTransactions,
		allCategories,
		allGroups,
		period,
	);

	const confirmedKeys = confirmedOccurrences.flatMap((k) =>
		k.recurrenceId && k.occurrenceOn
			? [{ recurrenceId: k.recurrenceId, occurrenceOn: k.occurrenceOn }]
			: [],
	);
	const extraPlanned = recurrencesToPlannedMovements(
		allRecurrences,
		confirmedKeys,
		{ start: cutoff, end: period.end },
	);
	const projectedFlow = aggregateCashFlow({
		accounts: allAccounts,
		transactions: allTransactions,
		window: { start: cutoff, end: period.end },
		granularity: "day",
		accountFilter: "all",
		today,
		extraPlannedMovements: extraPlanned,
	});
	const projections = projectAccountBalances({
		accounts: allAccounts,
		transactions: allTransactions,
		window: { start: cutoff, end: period.end },
		today,
		extraPlannedMovements: extraPlanned,
	});
	const negativeAlerts = negativeBalanceAlerts(projections).map((a) => ({
		accountName: a.accountName,
		lowestCents: a.minCents,
	}));
	const projectedConsolidatedCents =
		consolidatedCents +
		projectedFlow.totals.plannedIncome -
		(projectedFlow.totals.plannedExpense + projectedFlow.totals.invoiceOutflow);
	const realizedNetCents = totals.netCents;
	const plannedNetCents =
		projectedFlow.totals.plannedIncome -
		(projectedFlow.totals.plannedExpense + projectedFlow.totals.invoiceOutflow);
	const upcomingInvoiceCents = openInvoicesCents;

	const summaries: AssistantSummary[] = [
		summarizeMonthly({
			period,
			totals,
			previousNet: previousTotals.netCents,
			pendingReviewCount: pendingReviewBatches,
			uncategorizedCount: uncategorizedExpense.length,
			openInvoicesCents,
			alertsCount: negativeAlerts.length,
		}),
		summarizeIncome({
			period,
			totalIncomeCents: totals.incomeCents,
			previousIncomeCents: previousTotals.incomeCents,
			topCategories: incomeRanking.map((row) => ({
				categoryName: row.categoryName,
				amountCents: row.amountCents,
			})),
		}),
		summarizeExpenses({
			period,
			totalExpenseCents: totals.expenseCents,
			previousExpenseCents: previousTotals.expenseCents,
			topCategories: expenseRanking.map((row) => ({
				categoryName: row.categoryName,
				amountCents: row.amountCents,
			})),
			uncategorizedCount: uncategorizedExpense.length,
			uncategorizedCents: uncategorizedExpense.reduce(
				(sum, t) => sum + t.amountCents,
				0,
			),
		}),
		summarizeAccounts({
			consolidatedCents,
			cardDebtCents,
			openInvoicesCents,
			accountCount,
			cardCount,
			lowBalanceAccounts,
		}),
		summarizeBudget({
			period,
			usage: budgetUsage.map((u) => ({
				name: u.name,
				percent: u.percent,
				status: u.status,
				plannedCents: u.plannedCents,
				spentCents: u.spentCents,
			})),
		}),
		summarizeCashFlow({
			projectedConsolidatedCents,
			realizedNetCents,
			plannedNetCents,
			negativeAlerts,
			upcomingInvoiceCents,
		}),
	];

	const pendingByKind = groupByKind(pending);
	const totalPending = pending.length;
	const accountById = new Map(activeAccounts.map((a) => [a.id, a]));
	const categoryNames = new Map(allCategories.map((c) => [c.id, c.name]));
	const transactionsById = new Map(allTransactions.map((t) => [t.id, t]));

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={
					<form action={regenerateAssistantSuggestions}>
						<SubmitButton pendingLabel="Atualizando...">
							Atualizar sugestões
						</SubmitButton>
					</form>
				}
				description="Sugestões locais determinísticas para categorizar, revisar e economizar. Nenhuma alteração é aplicada sem sua confirmação."
				eyebrow="Assistente"
				title="Assistente financeiro"
			/>
			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatCard
					description={
						totalPending > 0
							? "Revise antes de aplicar"
							: "Nada esperando aprovação"
					}
					label="Sugestões pendentes"
					tone={totalPending > 0 ? "warning" : "default"}
					value={String(totalPending)}
				/>
				<StatCard
					description={`${formatDate(period.start)} – ${formatDate(period.end)}`}
					label="Mês analisado"
					value={formatMonthLabel(period)}
				/>
				<StatCard
					description="Decisões exibidas abaixo"
					label="Histórico recente"
					value={String(decided.length)}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Resumos</CardTitle>
					<CardDescription>
						Resumos gerados a partir dos dados deste mês. Apenas leitura.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 lg:grid-cols-2">
						{summaries.map((summary) => (
							<SummaryBlock key={summary.theme} summary={summary} />
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sugestões pendentes</CardTitle>
					<CardDescription>
						Cada item exige aceitar ou rejeitar. Aceitar aplica a ação
						correspondente.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{totalPending === 0 ? (
						<EmptyState
							description="Use “Atualizar sugestões” após importar ou corrigir transações."
							title="Nenhuma sugestão pendente."
						/>
					) : (
						<div className="space-y-6">
							{kindOrder.map((kind) => {
								const items = pendingByKind.get(kind) ?? [];
								if (items.length === 0) return null;
								return (
									<section className="space-y-3" key={kind}>
										<h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
											{kindLabels[kind]} · {items.length}
										</h3>
										<div className="grid gap-3">
											{items.map((suggestion) => (
												<SuggestionRow
													accountById={accountById}
													categoryNames={categoryNames}
													key={suggestion.id}
													suggestion={suggestion}
													transactionsById={transactionsById}
												/>
											))}
										</div>
									</section>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Histórico recente</CardTitle>
					<CardDescription>
						Últimas decisões registradas para auditoria.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{decided.length === 0 ? (
						<EmptyState title="Sem decisões registradas até o momento." />
					) : (
						<div className="space-y-2">
							{decided.map((row) => (
								<div
									className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm"
									key={row.id}
								>
									<div>
										<p className="font-medium text-foreground">
											{kindLabels[row.kind as Suggestion["kind"]]}
										</p>
										<p className="text-muted-foreground text-xs">
											{row.reason}
										</p>
									</div>
									<div className="text-right text-xs">
										<p
											className={
												row.status === "accepted"
													? "text-primary"
													: "text-destructive"
											}
										>
											{row.status === "accepted" ? "Aceita" : "Rejeitada"}
										</p>
										{row.decidedAt ? (
											<p className="text-muted-foreground">
												{row.decidedAt.toLocaleString("pt-BR")}
											</p>
										) : null}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</AppShell>
	);
}

function SummaryBlock({ summary }: { summary: AssistantSummary }) {
	return (
		<div className="rounded-md border bg-muted/20 p-4">
			<p className="font-medium">{summary.title}</p>
			<ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground text-sm">
				{summary.bullets.map((line) => (
					<li key={`${summary.theme}-${line}`}>{line}</li>
				))}
			</ul>
		</div>
	);
}

type StoredRow = {
	id: number;
	kind: Suggestion["kind"];
	fingerprint: string;
	payload: unknown;
	reason: string;
	status: "pending" | "accepted" | "rejected" | "superseded";
	decidedAt: Date | null;
	createdAt: Date;
};

function SuggestionRow({
	suggestion,
	accountById,
	categoryNames,
	transactionsById,
}: {
	suggestion: StoredRow;
	accountById: Map<number, { id: number; name: string }>;
	categoryNames: Map<number, string>;
	transactionsById: Map<
		number,
		{ id: number; description: string; occurredOn: string; amountCents: number }
	>;
}) {
	return (
		<AssistantSuggestionCard suggestionId={suggestion.id}>
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline">{kindLabels[suggestion.kind]}</Badge>
				<p className="font-medium text-sm">{suggestion.reason}</p>
			</div>
			<SuggestionDetails
				accountById={accountById}
				categoryNames={categoryNames}
				suggestion={suggestion}
				transactionsById={transactionsById}
			/>
		</AssistantSuggestionCard>
	);
}

function SuggestionDetails({
	suggestion,
	transactionsById,
}: {
	suggestion: StoredRow;
	accountById: Map<number, { id: number; name: string }>;
	categoryNames: Map<number, string>;
	transactionsById: Map<
		number,
		{ id: number; description: string; occurredOn: string; amountCents: number }
	>;
}) {
	if (suggestion.kind === "category_for_transaction") {
		const payload = suggestion.payload as {
			transactionId: number;
			categoryId: number;
			categoryName: string;
			ruleId: number | null;
			exampleDescription: string;
		};
		const tx = transactionsById.get(payload.transactionId);
		return (
			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					Categoria sugerida:{" "}
					<span className="text-foreground">{payload.categoryName}</span>
				</p>
				{tx ? (
					<p>
						Transação: {payload.exampleDescription} ·{" "}
						{formatDate(tx.occurredOn)} · {formatMoney(tx.amountCents)}
					</p>
				) : (
					<p>Transação não encontrada (pode ter sido excluída).</p>
				)}
				<p>
					{payload.ruleId
						? "Origem: regra existente."
						: "Origem: histórico do usuário."}
				</p>
				<Link className="text-primary hover:underline" href="/transactions">
					Ver transações
				</Link>
			</div>
		);
	}
	if (suggestion.kind === "category_rule") {
		const payload = suggestion.payload as {
			normalizedDescription: string;
			exampleDescription: string;
			movementType: "income" | "expense";
			categoryName: string;
			occurrenceCount: number;
		};
		return (
			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					Regra: contém “{payload.normalizedDescription}” → categoria{" "}
					<span className="text-foreground">{payload.categoryName}</span> (
					{payload.movementType === "income" ? "receita" : "despesa"}).
				</p>
				<p>
					Exemplo: {payload.exampleDescription} · observada{" "}
					{payload.occurrenceCount}x.
				</p>
			</div>
		);
	}
	if (suggestion.kind === "anomaly") {
		const payload = suggestion.payload as {
			monthKey: string;
			categoryName: string;
			groupName: string;
			currentCents: number;
			meanCents: number;
			thresholdCents: number;
		};
		return (
			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					{payload.categoryName} · {payload.groupName} ·{" "}
					{formatMoney(payload.currentCents)} no mês.
				</p>
				<p>
					Média histórica {formatMoney(payload.meanCents)} · limite{" "}
					{formatMoney(payload.thresholdCents)}.
				</p>
			</div>
		);
	}
	const payload = suggestion.payload as {
		key: string;
		label: string;
		amountCents: number;
		sources: ("subscription" | "grower" | "small_recurring")[];
	};
	return (
		<div className="space-y-1 text-muted-foreground text-xs">
			<p>
				{payload.label} · {formatMoney(payload.amountCents)}
			</p>
			<p>Origens: {payload.sources.map(sourceLabel).join(", ")}.</p>
		</div>
	);
}

function sourceLabel(
	source: "subscription" | "grower" | "small_recurring",
): string {
	if (source === "subscription") return "assinatura";
	if (source === "grower") return "categoria em alta";
	return "pequenos recorrentes";
}

function groupByKind(rows: StoredRow[]) {
	const map = new Map<Suggestion["kind"], StoredRow[]>();
	for (const row of rows) {
		const list = map.get(row.kind) ?? [];
		list.push(row);
		map.set(row.kind, list);
	}
	return map;
}

function previousMonthPeriod(monthKey: string) {
	const [y = 0, m = 1] = monthKey.split("-").map(Number);
	const date = new Date(y, m - 2, 1);
	const year = date.getFullYear().toString().padStart(4, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	const lastDay = last.getDate().toString().padStart(2, "0");
	return {
		key: `${year}-${month}`,
		start: `${year}-${month}-01`,
		end: `${year}-${month}-${lastDay}`,
	};
}

function toIsoDate(date: Date) {
	const y = date.getFullYear().toString().padStart(4, "0");
	const m = (date.getMonth() + 1).toString().padStart(2, "0");
	const d = date.getDate().toString().padStart(2, "0");
	return `${y}-${m}-${d}`;
}
