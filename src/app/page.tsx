import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
	FinanceShell,
	Panel,
	SummaryCard,
	TextInput,
} from "~/app/_components/finance-ui";
import { SignInForm } from "~/app/_components/sign-in-form";
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
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importRows,
	monthlyBudgets,
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
	]);

	const activeAccounts = allAccounts.filter((account) => !account.isArchived);
	const activeGroups = allGroups.filter((group) => !group.isArchived);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
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
	const projectedCashFlow = aggregateCashFlow({
		accounts: allAccounts,
		transactions: allTransactions,
		window: { start: monthCutoff, end: period.end },
		granularity: "day",
		accountFilter: "all",
		today,
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
			<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div>
						<p className="text-slate-400 text-sm">Mês analisado</p>
						<h2 className="mt-1 font-semibold text-2xl capitalize">
							{formatMonthLabel(period)}
						</h2>
						<p className="mt-1 text-slate-500 text-sm">
							{formatDate(period.start)} – {formatDate(period.end)}
						</p>
					</div>
					<form className="flex flex-wrap items-end gap-3">
						<label
							className="grid gap-1 text-slate-300 text-sm"
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
						<button
							className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-slate-950 text-sm"
							type="submit"
						>
							Atualizar
						</button>
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
						<ul className="grid gap-3 text-slate-300 text-sm">
							{insights.map((insight) => (
								<li
									className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
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
									className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
									key={account.id}
								>
									<div>
										<p className="font-medium">{account.name}</p>
										<p className="text-slate-500 text-xs">
											{account.institution ?? "Sem instituição"}
										</p>
									</div>
									<p
										className={
											account.type === "credit_card"
												? "font-semibold text-rose-300"
												: "font-semibold text-slate-100"
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
					<p className="mt-4 text-slate-500 text-xs">
						Inclui transações previstas e faturas futuras de cartão no
						vencimento; recorrências entram na Fase 8.
					</p>
				</Panel>
			</section>

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
									className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
									key={`${invoice.accountId}-${invoice.key}`}
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-medium">{invoice.accountName}</p>
											<p className="text-slate-500 text-xs">
												Fecha {formatDate(invoice.closingDate)} · vence{" "}
												{formatDate(invoice.dueDate)}
											</p>
										</div>
										<p className="font-semibold text-rose-300">
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
									className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-slate-600"
									href={`/import?batchId=${batch.id}`}
									key={batch.id}
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-medium">{batch.originalFileName}</p>
											<p className="text-slate-500 text-xs">
												{accountById.get(batch.accountId)?.name ??
													"Conta removida"}{" "}
												· {batch.rowCount} linha(s)
											</p>
										</div>
										<span className="rounded-full border border-amber-800 px-3 py-1 text-amber-200 text-xs">
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
		<main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
				<header className="border-slate-800 border-b pb-8">
					<p className="font-medium text-emerald-300 text-sm uppercase tracking-[0.3em]">
						Finanças pessoais
					</p>
					<h1 className="mt-3 font-semibold text-4xl tracking-tight">
						Finance App
					</h1>
					<p className="mt-3 max-w-2xl text-slate-300">
						Controle contas, categorias, transações e faturas em BRL.
					</p>
				</header>
				<section className="grid gap-8 md:grid-cols-[1fr_420px] md:items-start">
					<div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
						<h2 className="font-semibold text-2xl">
							Base simples para controle financeiro
						</h2>
						<p className="mt-4 text-slate-300">
							Entre com email e senha para acessar seu painel financeiro isolado
							por usuário.
						</p>
						<div className="mt-6 grid gap-3 text-slate-300 text-sm">
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
					className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
					key={row.label}
				>
					<div className="flex items-start justify-between gap-4 text-sm">
						<div>
							<p className="font-medium text-slate-100">{row.label}</p>
							<p className="text-slate-500 text-xs">
								{row.count} transação(ões)
							</p>
						</div>
						<p className="font-semibold">{formatMoney(row.amountCents)}</p>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
						<div
							className="h-full rounded-full bg-emerald-400"
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
		danger: "border-rose-900/80 bg-rose-950/30 text-rose-100",
		info: "border-sky-900/80 bg-sky-950/30 text-sky-100",
		warning: "border-amber-900/80 bg-amber-950/30 text-amber-100",
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
		<p className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-slate-400 text-sm">
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
