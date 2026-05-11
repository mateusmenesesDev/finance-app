import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FinanceShell, Panel, SummaryCard } from "~/app/_components/finance-ui";
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
	parseReportFilters,
	type ReportPanelId,
} from "~/lib/reports";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	monthlyBudgets,
	recurrences,
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
		db
			.select()
			.from(recurrences)
			.where(eq(recurrences.userId, session.user.id)),
	]);
	const categoryIndex = new Map(
		cats.map((category) => [category.id, category.groupId]),
	);
	const filtered = applyTransactionFilters(txs, filters, categoryIndex);
	const range = { from: filters.from, to: filters.to };
	const incomeRows = incomeExpenseSeries(filtered, range, filters.granularity);
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
		<FinanceShell
			description="Cruze período, contas, categorias e tipos para analisar seus dados financeiros."
			eyebrow="RELATÓRIOS"
			title="Relatórios e visualizações"
		>
			<ReportFilterForm
				accounts={accounts}
				categories={cats}
				filters={filters}
				groups={groups}
			/>
			{warning ? (
				<SummaryCard
					description={warning}
					label="Aviso"
					value="Granularidade"
					variant="warn"
				/>
			) : null}
			<div className="grid gap-6">
				<ReportPanel href={exportHref("income_expense")} id="income_expense">
					<IncomeExpenseChart rows={incomeRows} />
					<SimpleTable
						columns={[
							{ key: "label", label: "Período" },
							{ key: "incomeCents", label: "Receitas", money: true },
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
		</FinanceShell>
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
		<Suspense fallback={<Panel title={titles[id]}>Carregando…</Panel>}>
			<Panel title={titles[id]}>
				<div className="mb-4">
					<a
						className="rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
						download
						href={href}
					>
						Exportar CSV
					</a>
				</div>
				{children}
			</Panel>
		</Suspense>
	);
}
