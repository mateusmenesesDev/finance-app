import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
	AlertTriangle,
	ArrowDownUp,
	CreditCard,
	FileSpreadsheet,
	Info,
	PiggyBank,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createDefaultCategories } from "~/app/_actions/finance-actions";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Separator } from "~/components/ui/separator";
import { summarizeMonthly } from "~/lib/assistant";
import { aggregateCashFlow, computeFutureInvoices } from "~/lib/cash-flow";
import {
	buildBudgetUsage,
	calculateAccountBalances,
	calculateMonthlyBalanceTotals,
	calculateWealthSummary,
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
import { cn } from "~/lib/utils";
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
import { ensureBudgetTemplatesMaterialized } from "~/server/budget-templates";
import { userTag } from "~/server/invalidate";

type HomeProps = {
	searchParams?: Promise<{ month?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
	const session = await getSession();
	if (!session) redirect("/entrar");

	const params = await searchParams;
	const period = params?.month
		? (parseMonthPeriod(params.month) ?? getMonthPeriod())
		: getMonthPeriod();
	const previousPeriod = previousMonthPeriod(period.key);
	const today = toIsoDate(new Date());
	await ensureBudgetTemplatesMaterialized(session.user.id, [period.key]);
	const monthCutoff =
		today >= period.start && today <= period.end ? today : period.end;

	const {
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
	} = await loadDashboardData(session.user.id, period.key);
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
	const showOnboarding =
		showFirstAccountOnboarding ||
		showFirstImportOnboarding ||
		showCategoryOnboarding;
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const wealth = calculateWealthSummary(activeAccounts, allTransactions);
	const normalConsolidated = wealth.availableCashCents;
	const cardDebt = wealth.cardDebtCents;
	const monthlyTotals = calculateMonthlyBalanceTotals(
		allTransactions,
		activeCategories,
		activeGroups,
		period,
		allAccounts,
	);
	const previousTotals = calculateMonthlyBalanceTotals(
		allTransactions,
		activeCategories,
		activeGroups,
		previousPeriod,
		allAccounts,
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
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={
					<form className="flex items-end gap-2">
						<div className="grid gap-1">
							<Label className="text-xs" htmlFor="dashboard-month">
								Mês
							</Label>
							<Input
								className="h-9"
								defaultValue={period.key}
								id="dashboard-month"
								name="month"
								type="month"
							/>
						</div>
						<SubmitButton pendingLabel="Atualizando..." size="sm">
							Atualizar
						</SubmitButton>
					</form>
				}
				description={`Visão de ${formatMonthLabel(period)} — entradas, saídas, alertas e o que merece atenção.`}
				eyebrow="Dashboard"
				title={`Olá, ${session.user.name}`}
			/>

			{showOnboarding ? (
				<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{showFirstAccountOnboarding ? (
						<OnboardingCard
							action={
								<Button asChild>
									<Link href="/accounts">Criar conta</Link>
								</Button>
							}
							description="Cadastre uma conta corrente, carteira ou cartão para liberar saldos, importação e lançamentos."
							icon={Wallet}
							title="Comece criando sua primeira conta"
							tone="primary"
						/>
					) : null}
					{showFirstImportOnboarding ? (
						<OnboardingCard
							action={
								<Button asChild variant="outline">
									<Link href="/import">Ver guia de importação</Link>
								</Button>
							}
							description="Crie um modelo com as colunas do banco/cartão, envie o CSV e revise cada linha antes de confirmar."
							icon={FileSpreadsheet}
							title="Faça sua primeira importação CSV"
						/>
					) : null}
					{showCategoryOnboarding ? (
						<OnboardingCard
							action={
								<form
									action={async (formData) => {
										"use server";
										await createDefaultCategories({ error: null }, formData);
									}}
								>
									<SubmitButton
										pendingLabel="Criando..."
										size="sm"
										variant="outline"
									>
										Criar categorias iniciais
									</SubmitButton>
								</form>
							}
							description="Crie exemplos de renda, moradia, alimentação, transporte e outros grupos para acelerar a organização."
							icon={Sparkles}
							title="Use categorias iniciais"
						/>
					) : null}
				</section>
			) : null}

		<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
			<StatCard
				description={`Financeira: ${formatMoney(monthlyTotals.financialIncomeCents)} · total: ${formatMoney(monthlyTotals.incomeCents)}`}
				icon={TrendingUp}
				label="Receita principal"
				tone="success"
				value={formatMoney(monthlyTotals.mainIncomeCents)}
			/>
			<StatCard
				icon={TrendingDown}
				label="Despesas em dinheiro"
				tone="destructive"
				value={formatMoney(monthlyTotals.cashExpenseCents)}
			/>
			<StatCard
				icon={CreditCard}
				label="Fatura paga"
				tone="destructive"
				value={formatMoney(monthlyTotals.invoicePaymentCents)}
			/>
			<StatCard
				icon={ArrowDownUp}
				label="Saldo do mês"
				tone={monthlyTotals.netCents >= 0 ? "success" : "destructive"}
				value={formatMoney(monthlyTotals.netCents)}
			/>
			<StatCard
				description={budgetSummary.description}
				icon={PiggyBank}
				label="Orçamento usado"
				tone={budgetTone(budgetSummary.variant)}
				value={budgetSummary.label}
			/>
		</section>

			<section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Alertas importantes</CardTitle>
						<CardDescription>
							Itens que pedem atenção até o fim do mês.
						</CardDescription>
					</CardHeader>
					<CardContent>
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
							<EmptyState
								description="Nenhum alerta importante para este mês."
								icon={Info}
								title="Tudo em dia"
							/>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Insights principais</CardTitle>
						<CardDescription>
							Resumo automático a partir dos dados confirmados.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{insights.length > 0 ? (
							<ul className="grid gap-2 text-sm">
								{insights.map((insight) => (
									<li
										className="rounded-md border bg-muted/20 px-3 py-2 text-muted-foreground"
										key={insight}
									>
										{insight}
									</li>
								))}
							</ul>
						) : (
							<EmptyState
								description="Cadastre algumas transações para gerar análises."
								title="Sem insights ainda"
							/>
						)}
					</CardContent>
				</Card>
			</section>

			<Card>
				<CardHeader className="flex flex-row items-start justify-between gap-2">
					<div>
						<CardTitle>Assistente</CardTitle>
						<CardDescription>
							{pendingAssistantCount > 0
								? `${pendingAssistantCount} sugestões aguardam revisão.`
								: "Sem sugestões pendentes neste momento."}
						</CardDescription>
					</div>
					<Button asChild size="sm" variant="ghost">
						<Link href="/assistente">Abrir</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<ul className="grid gap-2 text-sm">
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
								className="rounded-md border bg-muted/20 px-3 py-2 text-muted-foreground"
								key={line}
							>
								{line}
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<section className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Saldo por conta</CardTitle>
						<CardDescription>
							Saldos atuais; cartões mostram a dívida em aberto.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{activeAccounts.length === 0 ? (
							<EmptyState
								action={
									<Button asChild size="sm">
										<Link href="/accounts">Criar conta</Link>
									</Button>
								}
								description="Cadastre uma conta para acompanhar saldos."
								icon={Wallet}
								title="Sem contas cadastradas"
							/>
						) : (
							<div className="grid gap-2">
								{activeAccounts.map((account) => {
									const balance = balances.get(account.id);
									const value =
										account.type === "credit_card"
											? (balance?.cardDebtCents ?? 0)
											: (balance?.normalBalanceCents ?? 0);
									return (
										<div
											className="flex items-center justify-between gap-4 rounded-md border bg-muted/10 px-3 py-2"
											key={account.id}
										>
											<div className="min-w-0">
												<p className="truncate font-medium text-sm">
													{account.name}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													{account.institution ?? "Sem instituição"}
												</p>
											</div>
											<Money
												cents={value}
												className="font-semibold text-sm"
												sign={
													account.type === "credit_card" ? "debit" : "neutral"
												}
											/>
										</div>
									);
								})}
							</div>
						)}
						<Separator />
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="rounded-md bg-muted/30 px-3 py-2">
								<p className="text-muted-foreground text-xs">Disponível</p>
								<Money
									cents={wealth.availableCashCents}
									className="font-semibold text-base"
								/>
							</div>
							<div className="rounded-md bg-muted/30 px-3 py-2">
								<p className="text-muted-foreground text-xs">Investido</p>
								<Money
									cents={wealth.investmentCents}
									className="font-semibold text-base"
								/>
							</div>
							<div className="rounded-md bg-muted/30 px-3 py-2">
								<p className="text-muted-foreground text-xs">
									Patrimônio líquido
								</p>
								<Money
									cents={wealth.totalWealthCents}
									className="font-semibold text-base"
								/>
							</div>
							<div className="rounded-md bg-muted/30 px-3 py-2">
								<p className="text-muted-foreground text-xs">
									Dívida em cartões
								</p>
								<Money
									cents={cardDebt}
									className="font-semibold text-base"
									sign={cardDebt > 0 ? "debit" : "neutral"}
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Fluxo previsto até o fim do mês</CardTitle>
						<CardDescription>
							Inclui transações previstas, recorrências e faturas futuras de
							cartão.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-3 sm:grid-cols-2">
							<MiniStat
								label="Entradas previstas"
								tone="success"
								value={formatMoney(projectedIncomeCents)}
							/>
							<MiniStat
								label="Saídas previstas"
								tone="destructive"
								value={formatMoney(projectedExpenseCents)}
							/>
							<MiniStat
								label="Saldo atual"
								value={formatMoney(normalConsolidated)}
							/>
							<MiniStat
								label="Saldo projetado"
								tone={projectedBalanceCents >= 0 ? "success" : "destructive"}
								value={formatMoney(projectedBalanceCents)}
							/>
						</div>
					</CardContent>
				</Card>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Assinaturas e gastos fixos</CardTitle>
					<CardDescription>
						Recorrências que mais comprometem o orçamento mensal.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{fixedExpenseRanking.length > 0 ? (
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{fixedExpenseRanking.map((item) => {
								const suggestion = reviewSuggestions.get(item.recurrenceId);
								return (
									<div
										className="rounded-md border bg-muted/20 p-3"
										key={item.recurrenceId}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-medium text-sm">
													{item.name}
												</p>
												<p className="text-muted-foreground text-xs">
													{item.isSubscription ? "Assinatura" : "Gasto fixo"}
													{item.isBill ? " · conta" : ""}
												</p>
											</div>
											{suggestion ? (
												<Badge variant="secondary">Revisar</Badge>
											) : null}
										</div>
										<Money
											cents={item.monthlyAmountCents}
											className="mt-2 block font-semibold"
											sign="debit"
										/>
										<p className="text-muted-foreground text-xs">por mês</p>
									</div>
								);
							})}
						</div>
					) : (
						<EmptyState
							description="Cadastre recorrências para ver gastos fixos."
							title="Sem recorrências"
						/>
					)}
				</CardContent>
			</Card>

			<section className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Gasto por grupo</CardTitle>
					</CardHeader>
					<CardContent>
						<Ranking
							rows={groupRanking.map((row) => ({
								amountCents: row.amountCents,
								count: row.transactionCount,
								label: row.groupName,
							}))}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Maiores categorias de despesa</CardTitle>
					</CardHeader>
					<CardContent>
						<Ranking
							rows={categoryRanking.map((row) => ({
								amountCents: row.amountCents,
								count: row.transactionCount,
								label: row.categoryName,
							}))}
						/>
					</CardContent>
				</Card>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Faturas abertas de cartão</CardTitle>
						<CardDescription>
							Estimadas pelas compras no cartão; pagamento de fatura segue como
							transferência.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{openInvoices.length > 0 ? (
							<div className="grid gap-2">
								{openInvoices.slice(0, 6).map((invoice) => (
									<div
										className="flex items-start justify-between gap-3 rounded-md border bg-muted/10 p-3"
										key={`${invoice.accountId}-${invoice.key}`}
									>
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{invoice.accountName}
											</p>
											<p className="text-muted-foreground text-xs">
												Fecha {formatDate(invoice.closingDate)} · vence{" "}
												{formatDate(invoice.dueDate)}
											</p>
										</div>
										<Money
											cents={invoice.remainingCents}
											className="font-semibold text-sm"
											sign="debit"
										/>
									</div>
								))}
							</div>
						) : (
							<EmptyState
								description="Nenhuma fatura aberta estimada."
								icon={CreditCard}
								title="Sem faturas em aberto"
							/>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Importações pendentes</CardTitle>
						<CardDescription>
							Lotes em rascunho ou revisão aguardando confirmação.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{pendingImports.length > 0 ? (
							<div className="grid gap-2">
								{pendingImports.slice(0, 6).map((batch) => (
									<Link
										className="flex items-start justify-between gap-3 rounded-md border bg-muted/10 p-3 transition hover:border-primary/50 hover:bg-muted/30"
										href={`/import?batchId=${batch.id}`}
										key={batch.id}
									>
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{batch.originalFileName}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												{accountById.get(batch.accountId)?.name ??
													"Conta removida"}{" "}
												· {batch.rowCount} linha(s)
											</p>
										</div>
										<Badge
											variant={batch.status === "draft" ? "outline" : "default"}
										>
											{batch.status === "draft" ? "rascunho" : "em revisão"}
										</Badge>
									</Link>
								))}
							</div>
						) : (
							<EmptyState
								description="Nenhuma importação aguardando revisão."
								icon={FileSpreadsheet}
								title="Sem importações pendentes"
							/>
						)}
					</CardContent>
				</Card>
			</section>
		</AppShell>
	);
}

function loadDashboardData(userId: string, periodKey: string) {
	return unstable_cache(
		async () => {
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
					.where(eq(financialAccounts.userId, userId))
					.orderBy(asc(financialAccounts.name)),
				db
					.select()
					.from(categoryGroups)
					.where(eq(categoryGroups.userId, userId))
					.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
				db
					.select()
					.from(categories)
					.where(eq(categories.userId, userId))
					.orderBy(asc(categories.kind), asc(categories.name)),
				db
					.select()
					.from(transactions)
					.where(eq(transactions.userId, userId))
					.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
				db
					.select()
					.from(importBatches)
					.where(eq(importBatches.userId, userId))
					.orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
				db
					.select()
					.from(importRows)
					.where(eq(importRows.userId, userId))
					.orderBy(asc(importRows.batchId), asc(importRows.rowNumber)),
				db
					.select()
					.from(monthlyBudgets)
					.where(eq(monthlyBudgets.userId, userId))
					.orderBy(asc(monthlyBudgets.scope), asc(monthlyBudgets.amountCents)),
				db
					.select()
					.from(recurrences)
					.where(eq(recurrences.userId, userId))
					.orderBy(asc(recurrences.name)),
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
						),
					),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(assistantSuggestions)
					.where(
						and(
							eq(assistantSuggestions.userId, userId),
							eq(assistantSuggestions.status, "pending"),
						),
					),
			]);
			return {
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
			};
		},
		[`dashboard-data:${userId}:${periodKey}`],
		{
			tags: [
				userTag(userId, "accounts"),
				userTag(userId, "categories"),
				userTag(userId, "transactions"),
				userTag(userId, "recurrences"),
				userTag(userId, "budgets"),
				userTag(userId, "imports"),
				userTag(userId, "assistant"),
			],
			revalidate: 3600,
		},
	)();
}

function MiniStat({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "success" | "destructive";
}) {
	const toneClass =
		tone === "success"
			? "text-success"
			: tone === "destructive"
				? "text-destructive"
				: "text-foreground";
	return (
		<div className="rounded-md bg-muted/30 px-3 py-2">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className={cn("font-semibold tabular-nums", toneClass)}>{value}</p>
		</div>
	);
}

function OnboardingCard({
	icon: Icon,
	title,
	description,
	action,
	tone = "default",
}: {
	icon: typeof Wallet;
	title: string;
	description: string;
	action: React.ReactNode;
	tone?: "default" | "primary";
}) {
	return (
		<Card
			className={
				tone === "primary" ? "border-primary/40 bg-primary/5" : undefined
			}
		>
			<CardHeader>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"flex size-8 items-center justify-center rounded-md",
							tone === "primary"
								? "bg-primary/15 text-primary"
								: "bg-muted text-muted-foreground",
						)}
					>
						<Icon className="size-4" />
					</span>
					<CardTitle className="text-base">{title}</CardTitle>
				</div>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{action}</CardContent>
		</Card>
	);
}

function Ranking({
	rows,
}: {
	rows: { amountCents: number; count: number; label: string }[];
}) {
	const max = Math.max(...rows.map((row) => row.amountCents), 0);
	if (rows.length === 0)
		return (
			<EmptyState
				description="Sem despesas confirmadas neste mês."
				title="Sem despesas confirmadas"
			/>
		);

	return (
		<div className="grid gap-3">
			{rows.map((row) => (
				<div key={row.label}>
					<div className="flex items-start justify-between gap-3 text-sm">
						<div className="min-w-0">
							<p className="truncate font-medium">{row.label}</p>
							<p className="text-muted-foreground text-xs">
								{row.count} transação(ões)
							</p>
						</div>
						<Money cents={row.amountCents} className="font-semibold" />
					</div>
					<Progress
						className="mt-2 h-1.5"
						value={max ? Math.max(4, (row.amountCents / max) * 100) : 0}
					/>
				</div>
			))}
		</div>
	);
}

function AlertItem({ alert }: { alert: DashboardAlert }) {
	const variant = {
		danger: "border-destructive/40 bg-destructive/5 text-destructive",
		warning: "border-warning/40 bg-warning/5 text-warning",
		info: "border-info/40 bg-info/5 text-info",
	}[alert.kind];

	const Icon = {
		danger: AlertTriangle,
		warning: AlertTriangle,
		info: Info,
	}[alert.kind];

	return (
		<div className={cn("flex gap-3 rounded-md border p-3", variant)}>
			<Icon className="mt-0.5 size-4 shrink-0" />
			<div className="min-w-0">
				<p className="font-medium text-sm">{alert.title}</p>
				<p className="mt-0.5 text-foreground/80 text-sm">{alert.message}</p>
			</div>
		</div>
	);
}

function budgetTone(
	variant: BudgetSummary["variant"],
): "default" | "success" | "warning" | "destructive" {
	switch (variant) {
		case "good":
			return "success";
		case "warn":
			return "warning";
		case "bad":
			return "destructive";
		default:
			return "default";
	}
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
	monthlyTotals: ReturnType<typeof calculateMonthlyBalanceTotals>;
	pendingImportCount: number;
	previousTotals: ReturnType<typeof calculateMonthlyBalanceTotals>;
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
