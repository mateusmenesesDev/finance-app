import { asc, desc, eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
	AccountMovementChart,
	BudgetVsActualChart,
	CardInvoiceChart,
	CashFlowLineChart,
	CategoryRankingChart,
	GroupStackChart,
	IncomeExpenseChart,
} from "~/app/reports/_components/charts";
import { ReportFilterForm } from "~/app/reports/_components/filter-form";
import { SimpleTable } from "~/app/reports/_components/tables";
import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	accountMovement,
	applyTransactionFilters,
	budgetVsActual,
	cardInvoiceSeries,
	cashFlowSeries,
	categoryRanking,
	granularityWarning,
	groupRanking,
	incomeExpenseSeries,
	monthKeysForDateRange,
	parseReportFilters,
	type ReportPanelId,
} from "~/lib/reports";
import { getSession } from "~/server/better-auth/server";
import { ensureBudgetTemplatesMaterialized } from "~/server/budget-templates";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	monthlyBudgets,
	transactions,
} from "~/server/db/schema";

type Props = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
const titles: Record<ReportPanelId, string> = {
	income_expense: "Receitas × despesas",
	categories: "Categorias",
	groups: "Grupos",
	accounts: "Movimento por conta",
	cards: "Faturas de cartão",
	budget: "Orçado × realizado",
	cash_flow: "Fluxo de caixa",
};

export default async function ReportsPage({ searchParams }: Props) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const params = await searchParams;
	const today = new Date().toISOString().slice(0, 10);
	const filters = parseReportFilters(params, today);
	await ensureBudgetTemplatesMaterialized(
		session.user.id,
		monthKeysForDateRange({ from: filters.from, to: filters.to }),
	);
	const [accounts, groups, cats, txs, budgets] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, session.user.id))
			.orderBy(asc(financialAccounts.name)),
		db
			.select()
			.from(categoryGroups)
			.where(eq(categoryGroups.userId, session.user.id))
			.orderBy(asc(categoryGroups.name)),
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, session.user.id))
			.orderBy(asc(categories.name)),
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, session.user.id))
			.orderBy(desc(transactions.occurredOn)),
		db
			.select()
			.from(monthlyBudgets)
			.where(eq(monthlyBudgets.userId, session.user.id))
			.orderBy(asc(monthlyBudgets.monthKey)),
	]);
	const categoryIndex = new Map(
		cats.map((category) => [category.id, category.groupId]),
	);
	const filtered = applyTransactionFilters(txs, filters, categoryIndex);
	const range = { from: filters.from, to: filters.to };
	const incomeRows = incomeExpenseSeries(
		filtered,
		range,
		filters.granularity,
		cats,
		groups,
	);
	const categoryRows = categoryRanking(
		filtered,
		cats,
		range,
		filters.granularity,
	);
	const groupRows = groupRanking(
		filtered,
		cats,
		groups,
		range,
		filters.granularity,
	);
	const accountRows = accountMovement(filtered, accounts);
	const cardRows = cardInvoiceSeries(filtered, accounts, range);
	const budgetRows = budgetVsActual(filtered, budgets, cats, groups, range);
	const cashRows = cashFlowSeries({
		accounts,
		transactions: filtered,
		range,
		granularity: filters.granularity,
		accountId: filters.accountId,
		today,
	}).buckets;
	const qs = new URLSearchParams();
	for (const [key, value] of Object.entries(params ?? {}))
		if (typeof value === "string") qs.set(key, value);
	const exportHref = (panel: ReportPanelId) =>
		`/api/reports/export?panel=${panel}&${qs.toString()}`;
	const warning = granularityWarning(range, filters.granularity);
	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Cruze período, contas, categorias e tipos para analisar seus dados financeiros."
				eyebrow="RELATÓRIOS"
				title="Relatórios e visualizações"
			/>
			<ReportFilterForm
				accounts={accounts}
				categories={cats}
				filters={filters}
				groups={groups}
			/>
			{warning ? (
				<StatCard
					description={warning}
					icon={AlertTriangle}
					label="Aviso"
					tone="warning"
					value="Granularidade"
				/>
			) : null}
			<div className="grid gap-6">
				<ReportPanel href={exportHref("income_expense")} id="income_expense">
					<IncomeExpenseChart rows={incomeRows} />
					<SimpleTable
						columns={[
							{ key: "label", label: "Período" },
							{
								key: "mainIncomeCents",
								label: "Receita principal",
								money: true,
							},
							{
								key: "financialIncomeCents",
								label: "Receita financeira",
								money: true,
							},
							{ key: "incomeCents", label: "Receitas totais", money: true },
							{ key: "expenseCents", label: "Despesas", money: true },
							{ key: "netCents", label: "Líquido", money: true },
						]}
						rows={incomeRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("categories")} id="categories">
					<CategoryRankingChart rows={categoryRows} />
					<SimpleTable
						columns={[
							{ key: "name", label: "Categoria" },
							{ key: "totalCents", label: "Total", money: true },
						]}
						rows={categoryRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("groups")} id="groups">
					<GroupStackChart rows={groupRows} />
					<SimpleTable
						columns={[
							{ key: "name", label: "Grupo" },
							{ key: "totalCents", label: "Total", money: true },
						]}
						rows={groupRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("accounts")} id="accounts">
					<AccountMovementChart rows={accountRows} />
					<SimpleTable
						columns={[
							{ key: "accountName", label: "Conta" },
							{ key: "inflowCents", label: "Entradas", money: true },
							{ key: "outflowCents", label: "Saídas", money: true },
							{ key: "netCents", label: "Líquido", money: true },
						]}
						rows={accountRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("cards")} id="cards">
					<CardInvoiceChart rows={cardRows} />
					<SimpleTable
						columns={[
							{ key: "monthKey", label: "Mês" },
							{ key: "accountName", label: "Cartão" },
							{ key: "totalCents", label: "Total", money: true },
						]}
						rows={cardRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("budget")} id="budget">
					<BudgetVsActualChart
						rows={budgetRows as Record<string, string | number | undefined>[]}
					/>
					<SimpleTable
						columns={[
							{ key: "monthKey", label: "Mês" },
							{ key: "name", label: "Escopo" },
							{ key: "plannedCents", label: "Previsto", money: true },
							{ key: "spentCents", label: "Realizado", money: true },
						]}
						rows={budgetRows}
					/>
				</ReportPanel>
				<ReportPanel href={exportHref("cash_flow")} id="cash_flow">
					<CashFlowLineChart rows={cashRows} />
					<SimpleTable
						columns={[
							{ key: "label", label: "Período" },
							{
								key: "realizedIncome",
								label: "Receita realizada",
								money: true,
							},
							{
								key: "realizedExpense",
								label: "Despesa realizada",
								money: true,
							},
							{ key: "plannedIncome", label: "Receita prevista", money: true },
							{ key: "plannedExpense", label: "Despesa prevista", money: true },
						]}
						rows={cashRows}
					/>
				</ReportPanel>
			</div>
		</AppShell>
	);
}
function ReportPanel({
	id,
	href,
	children,
}: {
	id: ReportPanelId;
	href: string;
	children: React.ReactNode;
}) {
	return (
		<Suspense
			fallback={
				<Card>
					<CardHeader>
						<CardTitle>{titles[id]}</CardTitle>
					</CardHeader>
					<CardContent>Carregando…</CardContent>
				</Card>
			}
		>
			<Card>
				<CardHeader className="flex flex-row items-start justify-between gap-3">
					<CardTitle>{titles[id]}</CardTitle>
					<Button asChild size="sm" variant="outline">
						<a download href={href}>
							Exportar CSV
						</a>
					</Button>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</Suspense>
	);
}
