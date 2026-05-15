import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";

import { createDefaultCategories } from "~/app/_actions/finance-actions";
import {
	FinanceShell,
	Panel,
	SubmitButton,
	SummaryCard,
	TextInput,
} from "~/app/_components/finance-ui";
import { SignInForm } from "~/app/_components/sign-in-form";
import { summarizeMonthly } from "~/lib/assistant";
import { aggregateCashFlow, computeFutureInvoices } from "~/lib/cash-flow";
import {
	buildBudgetUsage,
	calculateAccountBalances,
	calculateMonthlyTotals,
	getMonthPeriod,
	parseMonthPeriod,
	rankMonthlyCategories,
	rankMonthlyGroups,
} from "~/lib/finance-rules";
import {
	formatDate,
	formatMoney,
	formatMonthLabel,
	formatPercent,
} from "~/lib/formatters";
import {
	lateRecurrences,
	rankFixedExpenses,
	recurrencesToPlannedMovements,
	subscriptionReviewSuggestions,
} from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	assistantSuggestions,
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importRows,
	monthlyBudgets,
	recurrences,
	transactions,
} from "~/server/db/schema";

type HomeProps = {
	searchParams?: Promise<{ month?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
	const session = await getSession();
	if (!session) return <PublicHome />;

	const params = await searchParams;
	const period = params?.month
		? (parseMonthPeriod(params.month) ?? getMonthPeriod())
		: getMonthPeriod();
	const previousPeriod = previousMonthPeriod(period.key);
	const today = toIsoDate(new Date());
	const monthCutoff =
		today >= period.start && today <= period.end ? today : period.end;

	const [
		allAccounts,
		allGroups,
		allCategories,
		allTransactions,
		batches,
		rows,
		budgetRows,
		allRecurrences,
		confirmedOccurrences,
		assistantPending,
	] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, session.user.id))
			.orderBy(asc(financialAccounts.name)),
		db
			.select()
			.from(categoryGroups)
			.where(eq(categoryGroups.userId, session.user.id))
			.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, session.user.id))
			.orderBy(asc(categories.kind), asc(categories.name)),
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, session.user.id))
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		db
			.select()
			.from(importBatches)
			.where(eq(importBatches.userId, session.user.id))
			.orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
		db
			.select()
			.from(importRows)
			.where(eq(importRows.userId, session.user.id))
			.orderBy(asc(importRows.batchId), asc(importRows.rowNumber)),
		db
			.select()
			.from(monthlyBudgets)
			.where(eq(monthlyBudgets.userId, session.user.id))
			.orderBy(asc(monthlyBudgets.scope), asc(monthlyBudgets.amountCents)),
		db
			.select()
			.from(recurrences)
			.where(eq(recurrences.userId, session.user.id))
			.orderBy(asc(recurrences.name)),
		db
			.select({
				recurrenceId: transactions.recurrenceId,
				occurrenceOn: transactions.recurrenceOccurrenceOn,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, session.user.id),
					isNotNull(transactions.recurrenceId),
				),
			),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(assistantSuggestions)
			.where(
				and(
					eq(assistantSuggestions.userId, session.user.id),
					eq(assistantSuggestions.status, "pending"),
				),
			),
	]);
	const pendingAssistantCount = assistantPending[0]?.count ?? 0;

	const activeAccounts = allAccounts.filter((account) => !account.isArchived);
	const activeGroups = allGroups.filter((group) => !group.isArchived);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
	const showFirstAccountOnboarding = activeAccounts.length === 0;
	const showFirstImportOnboarding =
		activeAccounts.length > 0 && batches.length === 0;
	const showCategoryOnboarding = activeCategories.length === 0;
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const normalConsolidated = activeAccounts.reduce(
		(total, account) =>
			total + (balances.get(account.id)?.normalBalanceCents ?? 0),
		0,
	);
	const cardDebt = activeAccounts.reduce(
		(total, account) => total + (balances.get(account.id)?.cardDebtCents ?? 0),
		0,
	);
	const monthlyTotals = calculateMonthlyTotals(allTransactions, period);
	const previousTotals = calculateMonthlyTotals(
		allTransactions,
		previousPeriod,
	);
	const groupRanking = rankMonthlyGroups(
		allTransactions,
		activeCategories,
		activeGroups,
		period,
		"expense",
		6,
	);
	const categoryRanking = rankMonthlyCategories(
		allTransactions,
		activeCategories,
		activeGroups,
		period,
		"expense",
		6,
	);
	const confirmedKeys = confirmedOccurrences.flatMap((key) =>
		key.recurrenceId && key.occurrenceOn
			? [{ recurrenceId: key.recurrenceId, occurrenceOn: key.occurrenceOn }]
			: [],
	);
	const extraPlannedMovements = recurrencesToPlannedMovements(
		allRecurrences,
		confirmedKeys,
		{ start: monthCutoff, end: period.end },
	);
	const fixedExpenseRanking = rankFixedExpenses(allRecurrences).slice(0, 6);
	const reviewSuggestions = new Map(
		subscriptionReviewSuggestions(allRecurrences, confirmedKeys, today).map(
			(suggestion) => [suggestion.recurrenceId, suggestion],
		),
	);
	const projectedCashFlow = aggregateCashFlow({
		accounts: allAccounts,
		transactions: allTransactions,
		window: { start: monthCutoff, end: period.end },
		granularity: "day",
		accountFilter: "all",
		today,
		extraPlannedMovements,
	});
	const projectedIncomeCents = projectedCashFlow.totals.plannedIncome;
	const projectedExpenseCents =
		projectedCashFlow.totals.plannedExpense +
		projectedCashFlow.totals.invoiceOutflow;
	const projectedBalanceCents =
		normalConsolidated + projectedIncomeCents - projectedExpenseCents;
	const budgetUsageRows = buildBudgetUsage(
		budgetRows.filter((budget) => budget.monthKey === period.key),
		allTransactions,
		allCategories,
		allGroups,
		period,
	);
	const budgetSummary = buildBudgetSummary(budgetUsageRows);
	const openInvoices = computeFutureInvoices(
		activeAccounts,
		allTransactions,
		today,
	);
	const pendingImports = batches.filter(
		(batch) => batch.status === "draft" || batch.status === "reviewing",
	);
	const uncategorizedCount = allTransactions.filter(
		(transaction) =>
			transaction.occurredOn >= period.start &&
			transaction.occurredOn <= period.end &&
			!transaction.isArchived &&
			transaction.status === "confirmed" &&
			(transaction.movementType === "income" ||
				transaction.movementType === "expense") &&
			!transaction.categoryId,
	).length;
	const alerts = [
		...budgetAlerts(budgetUsageRows),
		...lateRecurrenceAlerts(allRecurrences, confirmedKeys, today),
		...invoiceAlerts(openInvoices, today),
		...projectedAccountAlerts(activeAccounts, allTransactions, balances, {
			start: monthCutoff,
			end: period.end,
		}),
		...acceleratedSpendAlerts(
			allTransactions,
			period,
			previousPeriod,
			monthCutoff,
		),
		...uncategorizedAlerts(uncategorizedCount),
		...importAlerts(pendingImports, rows),
	];
	const insights = buildInsights({
		budgetSummary,
		categoryRanking,
		groupRanking,
		monthlyTotals,
		pendingImportCount: pendingImports.length,
		previousTotals,
		uncategorizedCount,
	});

	return (
		<FinanceShell
			description="Visão mensal para entender rapidamente quanto entrou, quanto saiu, onde foi gasto e o que merece atenção."
			eyebrow="Dashboard"
			title={`Olá, ${session.user.name}`}
		>
			{showFirstAccountOnboarding ||
			showFirstImportOnboarding ||
			showCategoryOnboarding ? (
				<section className="grid gap-4 md:grid-cols-3">
					{showFirstAccountOnboarding ? (
						<div className="rounded-3xl border border-[color:var(--color-good-border)] bg-[color:var(--color-good-bg)] p-5">
							<p className="font-semibold text-[color:var(--color-good)]">
								Comece criando sua primeira conta
							</p>
							<p className="mt-2 text-[color:var(--color-text-muted)] text-sm">
								Cadastre uma conta corrente, carteira ou cartão para liberar
								saldos, importação e lançamentos.
							</p>
							<Link
								className="mt-4 inline-block rounded-full bg-[color:var(--color-accent)] px-4 py-2 font-medium text-[color:var(--color-accent-text)] text-sm"
								href="/accounts"
							>
								Criar conta
							</Link>
						</div>
					) : null}
					{showFirstImportOnboarding ? (
						<div className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-5">
							<p className="font-semibold">Faça sua primeira importação CSV</p>
							<p className="mt-2 text-[color:var(--color-text-muted)] text-sm">
								Crie um modelo com as colunas do banco/cartão, envie o CSV e
								revise cada linha antes de confirmar.
							</p>
							<Link
								className="mt-4 inline-block rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm"
								href="/import"
							>
								Ver guia de importação
							</Link>
						</div>
					) : null}
					{showCategoryOnboarding ? (
						<div className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-5">
							<p className="font-semibold">Use categorias iniciais</p>
							<p className="mt-2 text-[color:var(--color-text-muted)] text-sm">
								Crie exemplos de renda, moradia, alimentação, transporte e
								outros grupos para acelerar a organização.
							</p>
							<form
								action={async (formData) => {
									"use server";
									await createDefaultCategories({ error: null }, formData);
								}}
								className="mt-4"
							>
								<SubmitButton
									className="rounded-full"
									pendingLabel="Criando..."
									variant="secondary"
								>
									Criar categorias iniciais
								</SubmitButton>
							</form>
						</div>
					) : null}
				</section>
			) : null}

			<section className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6">
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div>
						<p className="text-[color:var(--color-text-muted)] text-sm">
							Mês analisado
						</p>
						<h2 className="mt-1 font-semibold text-2xl capitalize">
							{formatMonthLabel(period)}
						</h2>
						<p className="mt-1 text-[color:var(--color-text-subtle)] text-sm">
							{formatDate(period.start)} – {formatDate(period.end)}
						</p>
					</div>
					<form className="flex flex-wrap items-end gap-3">
						<label
							className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
							htmlFor="dashboard-month"
						>
							Mês
							<TextInput
								defaultValue={period.key}
								id="dashboard-month"
								name="month"
								type="month"
							/>
						</label>
						<SubmitButton pendingLabel="Atualizando...">Atualizar</SubmitButton>
					</form>
				</div>

				<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<SummaryCard
						label="Receitas do mês"
						value={formatMoney(monthlyTotals.incomeCents)}
						variant="good"
					/>
					<SummaryCard
						label="Despesas do mês"
						value={formatMoney(monthlyTotals.expenseCents)}
						variant="bad"
					/>
					<SummaryCard
						label="Saldo do mês"
						value={formatMoney(monthlyTotals.netCents)}
						variant={monthlyTotals.netCents >= 0 ? "good" : "bad"}
					/>
					<SummaryCard
						description={budgetSummary.description}
						label="Orçamento usado"
						value={budgetSummary.label}
						variant={budgetSummary.variant}
					/>
				</div>
			</section>

			<section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
				<Panel title="Alertas importantes">
					{alerts.length > 0 ? (
						<div className="grid gap-3">
							{alerts.slice(0, 6).map((alert) => (
								<AlertItem
									alert={alert}
									key={`${alert.title}-${alert.message}`}
								/>
							))}
						</div>
					) : (
						<EmptyState text="Nenhum alerta importante para este mês." />
					)}
				</Panel>

				<Panel title="Insights principais do mês">
					{insights.length > 0 ? (
						<ul className="grid gap-3 text-[color:var(--color-text-muted)] text-sm">
							{insights.map((insight) => (
								<li
									className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={insight}
								>
									{insight}
								</li>
							))}
						</ul>
					) : (
						<EmptyState text="Ainda não há transações suficientes para gerar insights." />
					)}
				</Panel>
			</section>

			<Panel
				description={
					pendingAssistantCount > 0
						? `${pendingAssistantCount} sugestões aguardam revisão.`
						: "Sem sugestões pendentes neste momento."
				}
				title="Assistente"
			>
				<ul className="grid gap-2 text-[color:var(--color-text-muted)] text-sm">
					{summarizeMonthly({
						period,
						totals: monthlyTotals,
						previousNet: previousTotals.netCents,
						pendingReviewCount: pendingImports.length,
						uncategorizedCount,
						openInvoicesCents: openInvoices.reduce(
							(sum, inv) => sum + inv.remainingCents,
							0,
						),
						alertsCount: alerts.length,
					}).bullets.map((line) => (
						<li
							className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-3"
							key={line}
						>
							{line}
						</li>
					))}
				</ul>
				<Link
					className="mt-4 inline-block text-[color:var(--color-accent)] text-sm hover:underline"
					href="/assistente"
				>
					Abrir assistente
				</Link>
			</Panel>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel title="Saldo por conta">
					<div className="grid gap-3">
						{activeAccounts.map((account) => {
							const balance = balances.get(account.id);
							const value =
								account.type === "credit_card"
									? (balance?.cardDebtCents ?? 0)
									: (balance?.normalBalanceCents ?? 0);
							return (
								<div
									className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={account.id}
								>
									<div>
										<p className="font-medium">{account.name}</p>
										<p className="text-[color:var(--color-text-subtle)] text-xs">
											{account.institution ?? "Sem instituição"}
										</p>
									</div>
									<p
										className={
											account.type === "credit_card"
												? "font-semibold text-[color:var(--color-bad)]"
												: "font-semibold text-[color:var(--color-text)]"
										}
									>
										{formatMoney(value)}
									</p>
								</div>
							);
						})}
						{activeAccounts.length === 0 ? (
							<EmptyState text="Cadastre uma conta para acompanhar saldos." />
						) : null}
					</div>
					<div className="mt-4 grid gap-4 md:grid-cols-2">
						<SummaryCard
							label="Consolidado sem cartões"
							value={formatMoney(normalConsolidated)}
						/>
						<SummaryCard
							label="Dívida aberta em cartões"
							value={formatMoney(cardDebt)}
							variant={cardDebt > 0 ? "bad" : "default"}
						/>
					</div>
				</Panel>

				<Panel title="Fluxo previsto até o fim do mês">
					<div className="grid gap-4 md:grid-cols-2">
						<SummaryCard
							label="Entradas previstas"
							value={formatMoney(projectedIncomeCents)}
							variant="good"
						/>
						<SummaryCard
							label="Saídas previstas"
							value={formatMoney(projectedExpenseCents)}
							variant="bad"
						/>
						<SummaryCard
							label="Saldo atual considerado"
							value={formatMoney(normalConsolidated)}
						/>
						<SummaryCard
							label="Saldo projetado"
							value={formatMoney(projectedBalanceCents)}
							variant={projectedBalanceCents >= 0 ? "good" : "bad"}
						/>
					</div>
					<p className="mt-4 text-[color:var(--color-text-subtle)] text-xs">
						Inclui transações previstas, recorrências e faturas futuras de
						cartão.
					</p>
				</Panel>
			</section>

			<Panel title="Assinaturas e gastos fixos">
				{fixedExpenseRanking.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{fixedExpenseRanking.map((item) => {
							const suggestion = reviewSuggestions.get(item.recurrenceId);
							return (
								<div
									className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={item.recurrenceId}
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium">{item.name}</p>
											<p className="text-[color:var(--color-text-subtle)] text-xs">
												{item.isSubscription ? "Assinatura" : "Gasto fixo"}
												{item.isBill ? " · conta" : ""}
											</p>
										</div>
										{suggestion ? (
											<span className="rounded-full bg-[color:var(--color-warn-bg)] px-2 py-1 font-medium text-[color:var(--color-warn)] text-xs">
												Revisar
											</span>
										) : null}
									</div>
									<p className="mt-3 font-semibold text-[color:var(--color-bad)]">
										{formatMoney(item.monthlyAmountCents)} / mês
									</p>
								</div>
							);
						})}
					</div>
				) : (
					<EmptyState text="Cadastre recorrências para ver gastos fixos." />
				)}
			</Panel>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel title="Gasto por grupo de categoria">
					<Ranking
						rows={groupRanking.map((row) => ({
							amountCents: row.amountCents,
							count: row.transactionCount,
							label: row.groupName,
						}))}
					/>
				</Panel>
				<Panel title="Maiores categorias de despesa">
					<Ranking
						rows={categoryRanking.map((row) => ({
							amountCents: row.amountCents,
							count: row.transactionCount,
							label: row.categoryName,
						}))}
					/>
				</Panel>
			</section>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel
					description="Estimadas pelas compras no cartão; pagamento de fatura segue como transferência."
					title="Faturas abertas de cartão"
				>
					{openInvoices.length > 0 ? (
						<div className="grid gap-3">
							{openInvoices.slice(0, 6).map((invoice) => (
								<div
									className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={`${invoice.accountId}-${invoice.key}`}
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-medium">{invoice.accountName}</p>
											<p className="text-[color:var(--color-text-subtle)] text-xs">
												Fecha {formatDate(invoice.closingDate)} · vence{" "}
												{formatDate(invoice.dueDate)}
											</p>
										</div>
										<p className="font-semibold text-[color:var(--color-bad)]">
											{formatMoney(invoice.remainingCents)}
										</p>
									</div>
								</div>
							))}
						</div>
					) : (
						<EmptyState text="Nenhuma fatura aberta estimada." />
					)}
				</Panel>

				<Panel title="Importações pendentes de revisão">
					{pendingImports.length > 0 ? (
						<div className="grid gap-3">
							{pendingImports.slice(0, 6).map((batch) => (
								<Link
									className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 transition hover:border-[color:var(--color-border)]"
									href={`/import?batchId=${batch.id}`}
									key={batch.id}
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-medium">{batch.originalFileName}</p>
											<p className="text-[color:var(--color-text-subtle)] text-xs">
												{accountById.get(batch.accountId)?.name ??
													"Conta removida"}{" "}
												· {batch.rowCount} linha(s)
											</p>
										</div>
										<span className="rounded-full border border-[color:var(--color-warn-border)] px-3 py-1 text-[color:var(--color-warn)] text-xs">
											{batch.status === "draft" ? "rascunho" : "em revisão"}
										</span>
									</div>
								</Link>
							))}
						</div>
					) : (
						<EmptyState text="Nenhuma importação pendente." />
					)}
				</Panel>
			</section>
		</FinanceShell>
	);
}

function PublicHome() {
	return (
		<main className="min-h-screen bg-[color:var(--color-bg)] px-6 py-10 text-[color:var(--color-text)]">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
				<header className="border-[color:var(--color-border-subtle)] border-b pb-8">
					<p className="font-medium text-[color:var(--color-accent)] text-sm uppercase tracking-[0.3em]">
						Finanças pessoais
					</p>
					<h1 className="mt-3 font-semibold text-4xl tracking-tight">
						Finance App
					</h1>
					<p className="mt-3 max-w-2xl text-[color:var(--color-text-muted)]">
						Controle contas, categorias, transações e faturas em BRL.
					</p>
				</header>
				<section className="grid gap-8 md:grid-cols-[1fr_420px] md:items-start">
					<div className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-8">
						<h2 className="font-semibold text-2xl">
							Base simples para controle financeiro
						</h2>
						<p className="mt-4 text-[color:var(--color-text-muted)]">
							Entre com email e senha para acessar seu painel financeiro isolado
							por usuário.
						</p>
						<div className="mt-6 grid gap-3 text-[color:var(--color-text-muted)] text-sm">
							<p>• Compras no cartão são despesas.</p>
							<p>• Pagamento de fatura é transferência para o cartão.</p>
							<p>• Transações arquivadas não entram nos saldos padrão.</p>
						</div>
					</div>
					<SignInForm />
				</section>
			</div>
		</main>
	);
}

function Ranking({
	rows,
}: {
	rows: { amountCents: number; count: number; label: string }[];
}) {
	const max = Math.max(...rows.map((row) => row.amountCents), 0);
	if (rows.length === 0)
		return <EmptyState text="Sem despesas confirmadas neste mês." />;

	return (
		<div className="grid gap-3">
			{rows.map((row) => (
				<div
					className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
					key={row.label}
				>
					<div className="flex items-start justify-between gap-4 text-sm">
						<div>
							<p className="font-medium text-[color:var(--color-text)]">
								{row.label}
							</p>
							<p className="text-[color:var(--color-text-subtle)] text-xs">
								{row.count} transação(ões)
							</p>
						</div>
						<p className="font-semibold">{formatMoney(row.amountCents)}</p>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-surface-muted)]">
						<div
							className="h-full rounded-full bg-[color:var(--color-accent)]"
							style={{
								width: `${max ? Math.max(4, (row.amountCents / max) * 100) : 0}%`,
							}}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function AlertItem({ alert }: { alert: DashboardAlert }) {
	const className = {
		danger:
			"border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] text-[color:var(--color-bad)]",
		info: "border-[color:var(--color-info-border)] bg-[color:var(--color-info-bg)] text-[color:var(--color-info)]",
		warning:
			"border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
	}[alert.kind];

	return (
		<div className={`rounded-2xl border p-4 ${className}`}>
			<p className="font-medium">{alert.title}</p>
			<p className="mt-1 text-sm opacity-80">{alert.message}</p>
		</div>
	);
}

function EmptyState({ text }: { text: string }) {
	return (
		<p className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 text-[color:var(--color-text-muted)] text-sm">
			{text}
		</p>
	);
}

type DashboardAlert = {
	kind: "danger" | "info" | "warning";
	message: string;
	title: string;
};

type AccountRow = typeof financialAccounts.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type RecurrenceRow = typeof recurrences.$inferSelect;
type ImportBatchRow = typeof importBatches.$inferSelect;
type ImportRow = typeof importRows.$inferSelect;
type BudgetSummary = {
	description: string;
	label: string;
	variant: "bad" | "default" | "good" | "warn";
};

type BudgetUsageRow = ReturnType<typeof buildBudgetUsage>[number];

function buildBudgetSummary(usageRows: BudgetUsageRow[]): BudgetSummary {
	const monthRow = usageRows.find((row) => row.scope === "month");
	if (monthRow) return budgetSummaryFromRows([monthRow], "no mês");

	const groupRows = usageRows.filter((row) => row.scope === "category_group");
	if (groupRows.length > 0) {
		return budgetSummaryFromRows(groupRows, `em ${groupRows.length} grupo(s)`);
	}

	const categoryRows = usageRows.filter((row) => row.scope === "category");
	if (categoryRows.length > 0) {
		return budgetSummaryFromRows(
			categoryRows,
			`em ${categoryRows.length} categoria(s)`,
		);
	}

	return {
		description: "Nenhum orçamento mensal cadastrado para este mês.",
		label: "Não configurado",
		variant: "warn",
	};
}

function budgetSummaryFromRows(
	rows: BudgetUsageRow[],
	suffix: string,
): BudgetSummary {
	const plannedCents = rows.reduce((total, row) => total + row.plannedCents, 0);
	const spentCents = rows.reduce((total, row) => total + row.spentCents, 0);
	return {
		description: `${formatMoney(spentCents)} de ${formatMoney(plannedCents)} ${suffix}.`,
		label: formatPercent(spentCents / plannedCents),
		variant: budgetVariant(spentCents, plannedCents),
	};
}

function budgetVariant(
	spentCents: number,
	budgetCents: number,
): BudgetSummary["variant"] {
	if (spentCents >= budgetCents) return "bad";
	if (spentCents >= budgetCents * 0.8) return "warn";
	return "good";
}

function budgetAlerts(usageRows: BudgetUsageRow[]): DashboardAlert[] {
	return usageRows
		.filter((row) => row.status === "near" || row.status === "over")
		.map((row) => ({
			kind: row.status === "over" ? "danger" : "warning",
			message: `${row.name}: ${formatMoney(row.spentCents)} de ${formatMoney(row.plannedCents)} usados (${formatPercent(row.percent)}).`,
			title:
				row.status === "over"
					? "Orçamento acima do limite"
					: "Orçamento próximo do limite",
		}));
}

function lateRecurrenceAlerts(
	allRecurrences: RecurrenceRow[],
	confirmedKeys: { occurrenceOn: string; recurrenceId: number }[],
	today: string,
): DashboardAlert[] {
	return lateRecurrences(allRecurrences, confirmedKeys, today)
		.slice(0, 6)
		.map(({ recurrence, occurrenceOn }) => ({
			kind: "danger",
			message: `${recurrence.name} era esperada em ${formatDate(occurrenceOn)} (${formatMoney(recurrence.amountCents)}).`,
			title: "Recorrência atrasada",
		}));
}

function invoiceAlerts(
	invoices: ReturnType<typeof computeFutureInvoices>,
	today: string,
): DashboardAlert[] {
	const limit = addDays(today, 7);
	return invoices
		.filter((invoice) => invoice.dueDate >= today && invoice.dueDate <= limit)
		.map((invoice) => ({
			kind: "warning",
			message: `${invoice.accountName} vence em ${formatDate(invoice.dueDate)} com ${formatMoney(invoice.remainingCents)} em aberto.`,
			title: "Fatura próxima do vencimento",
		}));
}

function projectedAccountAlerts(
	accounts: AccountRow[],
	allTransactions: TransactionRow[],
	balances: Map<number, { cardDebtCents: number; normalBalanceCents: number }>,
	period: { end: string; start: string },
): DashboardAlert[] {
	const normalAccountTypes = new Set([
		"checking",
		"savings",
		"cash",
		"investment",
	]);
	const alerts: DashboardAlert[] = [];

	for (const account of accounts) {
		if (!normalAccountTypes.has(account.type)) continue;
		let projected = balances.get(account.id)?.normalBalanceCents ?? 0;
		for (const transaction of allTransactions) {
			if (
				transaction.isArchived ||
				transaction.status !== "planned" ||
				transaction.occurredOn < period.start ||
				transaction.occurredOn > period.end ||
				transaction.accountId !== account.id
			)
				continue;
			if (transaction.movementType === "income")
				projected += transaction.amountCents;
			if (transaction.movementType === "expense")
				projected -= transaction.amountCents;
		}
		if (projected < 0) {
			alerts.push({
				kind: "danger",
				message: `${account.name} pode ficar em ${formatMoney(projected)} até o fim do mês.`,
				title: "Conta com saldo projetado baixo",
			});
		}
	}

	return alerts;
}

function acceleratedSpendAlerts(
	allTransactions: TransactionRow[],
	period: { end: string; start: string },
	previousPeriod: { end: string; start: string },
	monthCutoff: string,
): DashboardAlert[] {
	const day = Number(monthCutoff.slice(8, 10));
	const previousCutoff = clampDay(previousPeriod.start, day);
	const currentExpense = expenseBetween(
		allTransactions,
		period.start,
		monthCutoff,
	);
	const previousExpense = expenseBetween(
		allTransactions,
		previousPeriod.start,
		previousCutoff,
	);
	if (previousExpense === 0 || currentExpense <= previousExpense * 1.3)
		return [];
	return [
		{
			kind: "warning",
			message: `Despesas estão ${formatPercent(currentExpense / previousExpense - 1)} acima do mês anterior no mesmo recorte.`,
			title: "Gasto acelerado",
		},
	];
}

function uncategorizedAlerts(uncategorizedCount: number): DashboardAlert[] {
	if (uncategorizedCount === 0) return [];
	return [
		{
			kind: "warning",
			message: `${uncategorizedCount} transação(ões) confirmada(s) do mês precisam de categoria.`,
			title: "Transações sem categoria",
		},
	];
}

function importAlerts(
	pendingImports: ImportBatchRow[],
	rows: ImportRow[],
): DashboardAlert[] {
	const rowsByBatch = new Map<number, ImportRow[]>();
	for (const row of rows)
		rowsByBatch.set(row.batchId, [
			...(rowsByBatch.get(row.batchId) ?? []),
			row,
		]);
	return pendingImports.flatMap((batch) => {
		const batchRows = rowsByBatch.get(batch.id) ?? [];
		const problemCount = batchRows.filter(
			(row) => row.status === "duplicate" || row.status === "invalid",
		).length;
		const ratio = batchRows.length > 0 ? problemCount / batchRows.length : 0;
		if (problemCount < 5 && ratio < 0.2) return [];
		return [
			{
				kind: "warning",
				message: `${batch.originalFileName}: ${problemCount} linha(s) duplicada(s) ou inválida(s).`,
				title: "Importação precisa de revisão",
			},
		];
	});
}

function buildInsights({
	budgetSummary,
	categoryRanking,
	groupRanking,
	monthlyTotals,
	pendingImportCount,
	previousTotals,
	uncategorizedCount,
}: {
	budgetSummary: BudgetSummary;
	categoryRanking: ReturnType<typeof rankMonthlyCategories>;
	groupRanking: ReturnType<typeof rankMonthlyGroups>;
	monthlyTotals: ReturnType<typeof calculateMonthlyTotals>;
	pendingImportCount: number;
	previousTotals: ReturnType<typeof calculateMonthlyTotals>;
	uncategorizedCount: number;
}) {
	const insights: string[] = [];
	const topGroup = groupRanking[0];
	const topCategory = categoryRanking[0];
	if (topGroup)
		insights.push(
			`Maior grupo de despesa: ${topGroup.groupName}, com ${formatMoney(topGroup.amountCents)}.`,
		);
	if (topCategory)
		insights.push(
			`Maior categoria de despesa: ${topCategory.categoryName}, com ${formatMoney(topCategory.amountCents)}.`,
		);
	if (previousTotals.expenseCents > 0)
		insights.push(
			`Despesas estão ${formatPercent(monthlyTotals.expenseCents / previousTotals.expenseCents - 1)} em relação ao mês anterior.`,
		);
	if (monthlyTotals.transactionCount > 0)
		insights.push(
			`${formatPercent((monthlyTotals.transactionCount - uncategorizedCount) / monthlyTotals.transactionCount)} das transações financeiras do mês estão categorizadas.`,
		);
	if (budgetSummary.label !== "Não configurado")
		insights.push(
			`Orçamento usado no mês: ${budgetSummary.label} (${budgetSummary.description})`,
		);
	insights.push(
		monthlyTotals.netCents >= 0
			? `Resultado confirmado do mês está positivo em ${formatMoney(monthlyTotals.netCents)}.`
			: `Resultado confirmado do mês está negativo em ${formatMoney(Math.abs(monthlyTotals.netCents))}.`,
	);
	if (pendingImportCount > 0)
		insights.push(
			`${pendingImportCount} importação(ões) aguardam revisão antes de virar transação definitiva.`,
		);
	return insights;
}

function previousMonthPeriod(monthKey: string) {
	const [year, month] = monthKey.split("-").map(Number);
	return getMonthPeriod(new Date(year ?? 0, (month ?? 1) - 2, 1));
}

function expenseBetween(
	allTransactions: TransactionRow[],
	start: string,
	end: string,
) {
	return allTransactions.reduce((total, transaction) => {
		if (
			transaction.isArchived ||
			transaction.status !== "confirmed" ||
			transaction.movementType !== "expense" ||
			transaction.occurredOn < start ||
			transaction.occurredOn > end
		)
			return total;
		return total + transaction.amountCents;
	}, 0);
}

function clampDay(monthStart: string, day: number) {
	const [year, month] = monthStart.split("-").map(Number);
	const date = new Date(year ?? 0, (month ?? 1) - 1, 1);
	const lastDay = new Date(
		date.getFullYear(),
		date.getMonth() + 1,
		0,
	).getDate();
	return toIsoDate(
		new Date(date.getFullYear(), date.getMonth(), Math.min(day, lastDay)),
	);
}

function addDays(value: string, amount: number) {
	const date = parseIsoDate(value);
	date.setDate(date.getDate() + amount);
	return toIsoDate(date);
}

function parseIsoDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function toIsoDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
