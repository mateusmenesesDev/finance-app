import { asc, desc, eq } from "drizzle-orm";

import {
	accountMovement,
	applyTransactionFilters,
	budgetVsActual,
	cardInvoiceSeries,
	cashFlowSeries,
	categoryRanking,
	columnDate,
	columnMoney,
	columnText,
	csvHeaders,
	groupRanking,
	incomeExpenseSeries,
	parseReportFilters,
	type ReportPanelId,
	reportPanelIds,
	serializeCsv,
} from "~/lib/reports";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	monthlyBudgets,
	transactions,
} from "~/server/db/schema";

export async function GET(request: Request) {
	const session = await getSession();
	if (!session?.user.id) return new Response("Não autorizado", { status: 401 });
	const url = new URL(request.url);
	const panel = url.searchParams.get("panel") as ReportPanelId | null;
	if (!panel || !reportPanelIds.includes(panel))
		return new Response("Painel inválido", { status: 400 });
	const today = new Date().toISOString().slice(0, 10);
	const filters = parseReportFilters(url.searchParams, today);
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
	const range = { from: filters.from, to: filters.to };
	const categoryIndex = new Map(
		cats.map((category) => [category.id, category.groupId]),
	);
	const filtered = applyTransactionFilters(txs, filters, categoryIndex);
	let csv = "";
	if (panel === "income_expense")
		csv = serializeCsv(
			incomeExpenseSeries(filtered, range, filters.granularity, cats, groups),
			[
				columnText("Período", (r) => r.label),
				columnDate("Início", (r) => r.start),
				columnDate("Fim", (r) => r.end),
				columnMoney("Receita principal", (r) => r.mainIncomeCents),
				columnMoney("Receita financeira", (r) => r.financialIncomeCents),
				columnMoney("Receitas totais", (r) => r.incomeCents),
				columnMoney("Despesas", (r) => r.expenseCents),
				columnMoney("Líquido", (r) => r.netCents),
			],
		);
	if (panel === "categories")
		csv = serializeCsv(
			categoryRanking(filtered, cats, range, filters.granularity),
			[
				columnText("Categoria", (r) => r.name),
				columnMoney("Total", (r) => r.totalCents),
			],
		);
	if (panel === "groups")
		csv = serializeCsv(
			groupRanking(filtered, cats, groups, range, filters.granularity),
			[
				columnText("Grupo", (r) => r.name),
				columnMoney("Total", (r) => r.totalCents),
			],
		);
	if (panel === "accounts")
		csv = serializeCsv(accountMovement(filtered, accounts), [
			columnText("Conta", (r) => r.accountName),
			columnMoney("Entradas", (r) => r.inflowCents),
			columnMoney("Saídas", (r) => r.outflowCents),
			columnMoney("Líquido", (r) => r.netCents),
		]);
	if (panel === "cards")
		csv = serializeCsv(cardInvoiceSeries(filtered, accounts, range), [
			columnText("Mês", (r) => r.monthKey),
			columnText("Cartão", (r) => r.accountName),
			columnMoney("Total", (r) => r.totalCents),
		]);
	if (panel === "budget")
		csv = serializeCsv(budgetVsActual(filtered, budgets, cats, groups, range), [
			columnText("Mês", (r) => r.monthKey),
			columnText("Escopo", (r) => r.name),
			columnMoney("Previsto", (r) => r.plannedCents),
			columnMoney("Realizado", (r) => r.spentCents),
			columnMoney("Restante", (r) => r.remainingCents),
		]);
	if (panel === "cash_flow")
		csv = serializeCsv(
			cashFlowSeries({
				accounts,
				transactions: filtered,
				range,
				granularity: filters.granularity,
				accountId: filters.accountId,
				today,
			}).buckets,
			[
				columnText("Período", (r) => r.label),
				columnDate("Início", (r) => r.start),
				columnDate("Fim", (r) => r.end),
				columnMoney("Receita realizada", (r) => r.realizedIncome),
				columnMoney("Despesa realizada", (r) => r.realizedExpense),
				columnMoney("Receita prevista", (r) => r.plannedIncome),
				columnMoney("Despesa prevista", (r) => r.plannedExpense),
			],
		);
	return new Response(csv, {
		headers: csvHeaders(`relatorio-${panel}-${filters.from}-${filters.to}.csv`),
	});
}
