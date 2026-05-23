import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
	comparisonText,
	Empty,
	InsightList,
	RankingPanel,
	SeriesTable,
	safePercent,
	sourceLabel,
	TotalsTable,
} from "~/app/analysis/_components";
import { AppShell } from "~/components/app-shell";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
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
import {
	buildComparisons,
	buildMonthWindow,
	categoryAnomalies,
	categoryMonthlySeries,
	concentrationSummary,
	groupMonthlySeries,
	monthlyTotalsSeries,
	rankAccountsByExpense,
	rankDescriptions,
	rankLargestExpenses,
	rankSubscriptions,
	savingOpportunities,
	smallRecurringDescriptions,
	topCategoryGrowers,
	topCategoryIdsForPeriod,
	topCategoryReducers,
	topGroupIdsForPeriod,
	uncategorizedExpenseStats,
} from "~/lib/analysis";
import {
	calculateMonthlyTotals,
	getMonthPeriod,
	listMonthOptions,
	parseMonthPeriod,
	rankMonthlyCategories,
	rankMonthlyGroups,
} from "~/lib/finance-rules";
import { formatDate, formatMoney } from "~/lib/formatters";
import { subscriptionReviewSuggestions } from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	recurrences,
	transactions,
} from "~/server/db/schema";

type AnalysisPageProps = {
	searchParams?: Promise<{ month?: string }>;
};

export default async function AnalysisPage({
	searchParams,
}: AnalysisPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const params = await searchParams;
	const period = params?.month
		? (parseMonthPeriod(params.month) ?? getMonthPeriod())
		: getMonthPeriod();
	const trendWindow = buildMonthWindow(period, 6);
	const comparisonWindow = buildMonthWindow(period, 13);

	const [
		allAccounts,
		allGroups,
		allCategories,
		allTransactions,
		allRecurrences,
		confirmedOccurrences,
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
					isNotNull(transactions.recurrenceOccurrenceOn),
				),
			),
	]);

	const totals = calculateMonthlyTotals(allTransactions, period);
	const totalSeries = monthlyTotalsSeries(allTransactions, comparisonWindow);
	const incomeComparisons = buildComparisons(
		totalSeries.map((row) => ({
			monthKey: row.monthKey,
			amountCents: row.incomeCents,
		})),
		period,
	);
	const expenseComparisons = buildComparisons(
		totalSeries.map((row) => ({
			monthKey: row.monthKey,
			amountCents: row.expenseCents,
		})),
		period,
	);
	const netComparisons = buildComparisons(
		totalSeries.map((row) => ({
			monthKey: row.monthKey,
			amountCents: row.netCents,
		})),
		period,
	);

	const categoryRanking = rankMonthlyCategories(
		allTransactions,
		allCategories,
		allGroups,
		period,
		"expense",
		10,
	);
	const groupRanking = rankMonthlyGroups(
		allTransactions,
		allCategories,
		allGroups,
		period,
		"expense",
		10,
	);
	const accountRanking = rankAccountsByExpense(
		allTransactions,
		allAccounts,
		period,
		10,
	);
	const descriptionRanking = rankDescriptions(allTransactions, period, 10);
	const subscriptionRanking = rankSubscriptions(allRecurrences, 10);
	const largestExpenses = rankLargestExpenses(
		allTransactions,
		allAccounts,
		allCategories,
		period,
		10,
	);

	const topCategoryIds = topCategoryIdsForPeriod(
		allTransactions,
		allCategories,
		allGroups,
		period,
		5,
	);
	const topGroupIds = topGroupIdsForPeriod(
		allTransactions,
		allCategories,
		allGroups,
		period,
		5,
	);
	const categorySeries = categoryMonthlySeries(
		allTransactions,
		allCategories,
		allGroups,
		comparisonWindow,
		topCategoryIds,
	);
	const groupSeries = groupMonthlySeries(
		allTransactions,
		allCategories,
		allGroups,
		comparisonWindow,
		topGroupIds,
	);
	const trendTotals = totalSeries.slice(-6);

	const growers = topCategoryGrowers(
		allTransactions,
		allCategories,
		allGroups,
		period,
		{ limit: 5 },
	);
	const reducers = topCategoryReducers(
		allTransactions,
		allCategories,
		allGroups,
		period,
		{ limit: 5 },
	);
	const anomalies = categoryAnomalies(
		allTransactions,
		allCategories,
		allGroups,
		period,
		6,
	);
	const concentration = concentrationSummary(groupRanking, totals.expenseCents);
	const smallRecurring = smallRecurringDescriptions(
		allTransactions,
		trendWindow,
	).slice(0, 5);
	const subscriptionSuggestions = subscriptionReviewSuggestions(
		allRecurrences,
		confirmedOccurrences.filter(
			(
				occurrence,
			): occurrence is { recurrenceId: number; occurrenceOn: string } =>
				occurrence.recurrenceId !== null && occurrence.occurrenceOn !== null,
		),
		period.end,
		{ topN: 5 },
	);
	const recurrenceNames = new Map(
		allRecurrences.map((recurrence) => [recurrence.id, recurrence.name]),
	);
	const opportunities = savingOpportunities({
		subscriptionsToReview: subscriptionSuggestions.map((suggestion) => ({
			...suggestion,
			name: recurrenceNames.get(suggestion.recurrenceId),
		})),
		growers,
		smallRecurring,
	}).slice(0, 8);
	const uncategorized = uncategorizedExpenseStats(allTransactions, period);
	const availableTrendMonths = trendTotals.filter(
		(row) => row.incomeCents !== 0 || row.expenseCents !== 0,
	).length;
	const monthOptions = listMonthOptions(new Date(), 18, 1);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Rankings, tendências e alertas para entender para onde o dinheiro está indo."
				eyebrow="Análise"
				title="Análise de gastos"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Resumo do mês</CardTitle>
					<CardDescription>
						Selecione o mês analisado e compare com o mês anterior.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form className="flex flex-wrap items-end gap-3">
						<div className="grid gap-2">
							<Label htmlFor="analysis-month">Mês</Label>
							<Input
								defaultValue={period.key}
								id="analysis-month"
								list="analysis-months"
								name="month"
								type="month"
							/>
						</div>
						<datalist id="analysis-months">
							{monthOptions.map((option) => (
								<option key={option.key} value={option.key} />
							))}
						</datalist>
						<SubmitButton pendingLabel="Aplicando...">Aplicar</SubmitButton>
					</form>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<StatCard
							description={comparisonText(incomeComparisons.previousMonth)}
							label="Receitas"
							tone="success"
							value={formatMoney(totals.incomeCents)}
						/>
						<StatCard
							description={comparisonText(expenseComparisons.previousMonth)}
							label="Despesas"
							tone="destructive"
							value={formatMoney(totals.expenseCents)}
						/>
						<StatCard
							description={comparisonText(netComparisons.previousMonth)}
							label="Saldo do mês"
							tone={totals.netCents >= 0 ? "success" : "destructive"}
							value={formatMoney(totals.netCents)}
						/>
					</div>
				</CardContent>
			</Card>

			<section className="grid gap-4 lg:grid-cols-2">
				<RankingPanel
					rows={categoryRanking.map((row) => ({
						label: row.categoryName,
						value: row.amountCents,
						detail: `${row.transactionCount} transações`,
					}))}
					title="Categorias"
				/>
				<RankingPanel
					rows={groupRanking.map((row) => ({
						label: row.groupName,
						value: row.amountCents,
						detail: `${row.transactionCount} transações`,
					}))}
					title="Grupos"
				/>
				<RankingPanel
					rows={accountRanking.map((row) => ({
						label: row.accountName,
						value: row.amountCents,
						detail: `${row.transactionCount} transações`,
					}))}
					title="Contas"
				/>
				<RankingPanel
					rows={descriptionRanking.map((row) => ({
						label: row.label,
						value: row.amountCents,
						detail: `${row.transactionCount} transações`,
					}))}
					title="Descrições"
				/>
				<RankingPanel
					rows={subscriptionRanking.map((row) => ({
						label: row.name,
						value: row.monthlyAmountCents,
						detail: "mensal estimado",
					}))}
					title="Assinaturas"
				/>
				<Card>
					<CardHeader>
						<CardTitle>Maiores transações</CardTitle>
					</CardHeader>
					<CardContent>
						{largestExpenses.length === 0 ? (
							<Empty />
						) : (
							<div className="space-y-3">
								{largestExpenses.map((row) => (
									<div
										className="rounded-md border bg-muted/20 p-3"
										key={`${row.date}-${row.description}-${row.amountCents}`}
									>
										<div className="flex justify-between gap-3">
											<div>
												<p className="font-medium">{row.description}</p>
												<p className="text-muted-foreground text-xs">
													{formatDate(row.date)} · {row.accountName} ·{" "}
													{row.categoryName}
												</p>
											</div>
											<Money
												cents={row.amountCents}
												className="font-semibold"
												sign="debit"
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Tendências</CardTitle>
					<CardDescription>
						Série dos últimos 6 meses e comparação dos principais grupos e
						categorias.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{availableTrendMonths < 6 ? (
						<p className="mb-4 text-sm text-warning">
							Análises de tendência usam {availableTrendMonths} de 6 meses
							disponíveis.
						</p>
					) : null}
					<TotalsTable rows={trendTotals} />
					<div className="mt-6 grid gap-4 lg:grid-cols-2">
						<SeriesTable
							period={period}
							rows={categorySeries}
							title="Top 5 categorias"
						/>
						<SeriesTable
							period={period}
							rows={groupSeries}
							title="Top 5 grupos"
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Insights</CardTitle>
					<CardDescription>
						Sinais automáticos para investigar antes de cortar gastos.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{availableTrendMonths < 6 ? (
						<p className="mb-4 text-sm text-warning">
							Análises de tendência usam {availableTrendMonths} de 6 meses
							disponíveis.
						</p>
					) : null}
					<div className="grid gap-4 lg:grid-cols-2">
						<InsightList
							rows={growers.map((row) => ({
								label: `${row.categoryName} · ${row.groupName}`,
								value: `${formatMoney(row.deltaCents)} (${safePercent(row.percent)})`,
								detail: `${formatMoney(row.baselineCents)} → ${formatMoney(row.currentCents)}`,
							}))}
							title="Mais cresceram"
						/>
						<InsightList
							rows={reducers.map((row) => ({
								label: `${row.categoryName} · ${row.groupName}`,
								value: `${formatMoney(row.deltaCents)} (${safePercent(row.percent)})`,
								detail: `${formatMoney(row.baselineCents)} → ${formatMoney(row.currentCents)}`,
							}))}
							title="Mais reduziram"
						/>
						<InsightList
							rows={anomalies.map((row) => ({
								label: `${row.categoryName} · ${row.groupName}`,
								value: formatMoney(row.currentCents),
								detail: `Média ${formatMoney(row.meanCents)} · limite ${formatMoney(row.thresholdCents)}`,
							}))}
							title="Anomalias"
						/>
						<Card>
							<CardHeader>
								<CardTitle>Concentração</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-sm">
									Maior grupo: {safePercent(concentration.topGroupShare)} · Top
									3: {safePercent(concentration.topThreeShare)}.
								</p>
								<p
									className={`mt-2 text-sm ${concentration.isConcentrated ? "text-warning" : "text-primary"}`}
								>
									{concentration.isConcentrated
										? "Gastos concentrados: vale revisar dependência dos maiores grupos."
										: "Sem concentração relevante pelos limites definidos."}
								</p>
							</CardContent>
						</Card>
						<InsightList
							rows={smallRecurring.map((row) => ({
								label: row.label,
								value: formatMoney(row.totalCents),
								detail: `${row.occurrenceCount} ocorrências · média ${formatMoney(row.averageCents)}`,
							}))}
							title="Pequenos recorrentes"
						/>
						<InsightList
							rows={opportunities.map((row) => ({
								label: row.label,
								value: formatMoney(row.amountCents),
								detail: row.sources.map(sourceLabel).join(", "),
							}))}
							title="Oportunidades de economia"
						/>
					</div>
					<div className="mt-4 rounded-md border bg-muted/20 p-4">
						<p className="font-medium">Despesas sem categoria</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{uncategorized.count} transações ·{" "}
							{formatMoney(uncategorized.amountCents)}
						</p>
						<Button asChild className="mt-2" size="sm" variant="link">
							<Link href={`/transactions?month=${period.key}`}>
								Revisar transações
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</AppShell>
	);
}
