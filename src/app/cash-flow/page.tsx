import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ComparisonTable, TimelineTable } from "~/app/cash-flow/_components";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
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
	aggregateCashFlow,
	comparePlannedVsRealized,
	computeFutureInvoices,
	consolidatedTimeline,
	defaultWindow,
	type Granularity,
	negativeBalanceAlerts,
	pendingReviewSummary,
	projectAccountBalances,
} from "~/lib/cash-flow";
import {
	calculateAccountBalances,
	calculateWealthSummary,
} from "~/lib/finance-rules";
import { formatDate, formatMoney, formatPercent } from "~/lib/formatters";
import { recurrencesToPlannedMovements } from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	financialAccounts,
	importBatches,
	importRows,
	recurrences,
	transactions,
} from "~/server/db/schema";

type CashFlowSearchParams = {
	accountId?: string;
	granularity?: string;
	windowEnd?: string;
	windowPreset?: string;
	windowStart?: string;
};

type CashFlowPageProps = {
	searchParams?: Promise<CashFlowSearchParams>;
};

const granularityOptions = {
	day: "Diária",
	week: "Semanal",
	month: "Mensal",
	year: "Anual",
};

const presetOptions = {
	"30d": "30 dias",
	"90d": "90 dias",
	"6m": "6 meses",
	"12m": "12 meses",
	custom: "Livre",
};

const selectClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default async function CashFlowPage({
	searchParams,
}: CashFlowPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const params = await searchParams;
	const today = isoToday();
	const granularity = parseGranularity(params?.granularity);
	const window = parseWindow(params, granularity, today);
	const accountFilter = params?.accountId
		? Number.parseInt(params.accountId, 10)
		: "all";

	const [
		allAccounts,
		allTransactions,
		allRecurrences,
		confirmedOccurrences,
		rows,
		batches,
	] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, session.user.id))
			.orderBy(asc(financialAccounts.name)),
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
				),
			),
		db
			.select()
			.from(importRows)
			.where(eq(importRows.userId, session.user.id))
			.orderBy(asc(importRows.batchId), asc(importRows.rowNumber)),
		db
			.select()
			.from(importBatches)
			.where(eq(importBatches.userId, session.user.id))
			.orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
	]);

	const activeAccounts = allAccounts.filter(
		(account) => !account.isArchived && account.isActive,
	);
	const normalAccounts = activeAccounts.filter(
		(account) =>
			account.type !== "credit_card" && account.type !== "investment",
	);
	const accountOptions = {
		all: "Todas as contas",
		...Object.fromEntries(
			activeAccounts.map((account) => [String(account.id), account.name]),
		),
	};
	const selectedAccountFilter =
		typeof accountFilter === "number" && Number.isFinite(accountFilter)
			? accountFilter
			: "all";
	const extraPlannedMovements = recurrencesToPlannedMovements(
		allRecurrences,
		confirmedOccurrences.flatMap((key) =>
			key.recurrenceId && key.occurrenceOn
				? [{ recurrenceId: key.recurrenceId, occurrenceOn: key.occurrenceOn }]
				: [],
		),
		window,
	);
	const aggregate = aggregateCashFlow({
		accounts: allAccounts,
		transactions: allTransactions,
		window,
		granularity,
		accountFilter: selectedAccountFilter,
		today,
		extraPlannedMovements,
	});
	const timeline = consolidatedTimeline({
		accounts: allAccounts,
		transactions: allTransactions,
		window,
		granularity,
		today,
		extraPlannedMovements,
	});
	const accountProjections = projectAccountBalances({
		accounts: normalAccounts,
		transactions: allTransactions,
		window,
		today,
		extraPlannedMovements,
	});
	const invoices = computeFutureInvoices(
		allAccounts,
		allTransactions,
		today,
	).filter(
		(invoice) =>
			invoice.dueDate >= window.start && invoice.dueDate <= window.end,
	);
	const alerts = negativeBalanceAlerts(accountProjections);
	const comparison = comparePlannedVsRealized(aggregate.buckets).slice(-12);
	const pending = pendingReviewSummary(allTransactions, rows);
	const batchById = new Map(batches.map((batch) => [batch.id, batch]));
	const wealth = calculateWealthSummary(activeAccounts, allTransactions);
	const finalConsolidated =
		timeline.at(-1)?.closingCents ??
		consolidatedOpening(allAccounts, allTransactions);
	const minConsolidated = minTimeline(timeline);
	const plannedIncome = aggregate.totals.plannedIncome;
	const plannedExpense =
		aggregate.totals.plannedExpense + aggregate.totals.invoiceOutflow;

	const timelineRows = timeline.map((row, index) => {
		const bucket = aggregate.buckets[index];
		const invoiceOutflow = bucket?.invoiceOutflow ?? 0;
		return {
			bucketKey: row.bucketKey,
			period: `${formatDate(row.bucketStart)} – ${formatDate(row.bucketEnd)}`,
			realized: row.realized,
			planned: row.planned + invoiceOutflow,
			invoiceOutflow,
			closingCents: row.closingCents,
		};
	});
	const comparisonRows = comparison.map((row) => ({
		key: row.key,
		plannedCents: row.plannedCents,
		realizedCents: row.realizedCents,
		deltaCents: row.deltaCents,
		deltaPercent:
			row.deltaPercent === null ? "—" : formatPercent(row.deltaPercent),
	}));

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Projete entradas, saídas, faturas e risco de saldo negativo sem misturar realizado, previsto e pendente."
				eyebrow="Fluxo de caixa"
				title="Fluxo de caixa"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Filtros do fluxo</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-end">
						<div className="grid gap-2">
							<Label htmlFor="granularity">Granularidade</Label>
							<select
								className={selectClass}
								defaultValue={granularity}
								id="granularity"
								name="granularity"
							>
								{Object.entries(granularityOptions).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="windowPreset">Janela</Label>
							<select
								className={selectClass}
								defaultValue={params?.windowPreset ?? "30d"}
								id="windowPreset"
								name="windowPreset"
							>
								{Object.entries(presetOptions).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="windowStart">Início livre</Label>
							<Input
								defaultValue={window.start}
								id="windowStart"
								name="windowStart"
								type="date"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="accountId">Conta</Label>
							<select
								className={selectClass}
								defaultValue={String(selectedAccountFilter)}
								id="accountId"
								name="accountId"
							>
								{Object.entries(accountOptions).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<input name="windowEnd" type="hidden" value={window.end} />
						<SubmitButton pendingLabel="Atualizando...">Atualizar</SubmitButton>
					</form>
					<p className="mt-4 text-muted-foreground text-xs">
						Período: {formatDate(window.start)} – {formatDate(window.end)}.
					</p>
				</CardContent>
			</Card>

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Entradas previstas"
					tone="success"
					value={formatMoney(plannedIncome)}
				/>
				<StatCard
					label="Saídas previstas"
					tone="destructive"
					value={formatMoney(plannedExpense)}
				/>
				<StatCard
					description={`Investido: ${formatMoney(wealth.investmentCents)} · patrimônio: ${formatMoney(wealth.totalWealthCents)}`}
					label="Disponível projetado"
					tone={finalConsolidated >= 0 ? "success" : "destructive"}
					value={formatMoney(finalConsolidated)}
				/>
				<StatCard
					description={
						minConsolidated ? formatDate(minConsolidated.date) : undefined
					}
					label="Mínimo projetado"
					tone={
						(minConsolidated?.balanceCents ?? finalConsolidated) >= 0
							? "default"
							: "destructive"
					}
					value={formatMoney(
						minConsolidated?.balanceCents ?? finalConsolidated,
					)}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Saldo disponível projetado por conta</CardTitle>
					<CardDescription>
						Exclui contas de investimento; caixinhas aparecem no patrimônio, não
						no caixa operacional.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{accountProjections.length > 0 ? (
						<div className="grid gap-3">
							{accountProjections.map((projection) => (
								<div
									className="rounded-md border bg-muted/20 p-4"
									key={projection.accountId}
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-medium">{projection.accountName}</p>
											<p className="text-muted-foreground text-xs">
												Mínimo {formatMoney(projection.minCents)} em{" "}
												{formatDate(projection.minDate)}
											</p>
										</div>
										<Money
											cents={projection.closingProjectedCents}
											className="font-semibold"
										/>
									</div>
									<Sparkline
										values={projection.dailyBalances.map(
											(item) => item.balanceCents,
										)}
									/>
								</div>
							))}
						</div>
					) : (
						<EmptyState title="Nenhuma conta normal ativa para projetar." />
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Linha do tempo</CardTitle>
					<CardDescription>
						Consolidado inclui faturas futuras; saldos por banco não assumem
						qual conta pagará o cartão.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TimelineTable rows={timelineRows} />
				</CardContent>
			</Card>

			<section className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Faturas futuras de cartão</CardTitle>
					</CardHeader>
					<CardContent>
						{invoices.length > 0 ? (
							<div className="grid gap-3">
								{invoices.map((invoice) => (
									<div
										className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 p-4"
										key={`${invoice.accountId}-${invoice.key}`}
									>
										<div>
											<p className="font-medium">{invoice.accountName}</p>
											<p className="text-muted-foreground text-xs">
												Vence {formatDate(invoice.dueDate)} · pago{" "}
												{formatMoney(invoice.paidCents)}
											</p>
										</div>
										<Money
											cents={invoice.remainingCents}
											className="font-semibold"
											sign="debit"
										/>
									</div>
								))}
							</div>
						) : (
							<EmptyState title="Nenhuma fatura futura aberta na janela." />
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Alertas de saldo</CardTitle>
					</CardHeader>
					<CardContent>
						{alerts.length > 0 ? (
							<div className="grid gap-3">
								{alerts.map((alert) => (
									<div
										className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive"
										key={alert.accountId}
									>
										<p className="font-medium">{alert.accountName}</p>
										<p className="mt-1 text-sm opacity-80">
											Pode chegar a {formatMoney(alert.minCents)} em{" "}
											{formatDate(alert.minDate)}.
										</p>
									</div>
								))}
							</div>
						) : (
							<EmptyState title="Nenhum risco de saldo negativo na janela." />
						)}
					</CardContent>
				</Card>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Previsto vs Realizado</CardTitle>
					</CardHeader>
					<CardContent>
						<ComparisonTable rows={comparisonRows} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Pendente de revisão</CardTitle>
					</CardHeader>
					<CardContent>
						{pending.transactionCount === 0 && pending.importRowCount === 0 ? (
							<EmptyState title="Nada pendente de revisão." />
						) : (
							<div className="grid gap-3 text-sm">
								{pending.transactions.slice(0, 6).map((transaction) => (
									<div
										className="rounded-md border bg-muted/20 p-4"
										key={`tx-${transaction.id}`}
									>
										<p className="font-medium">
											{transaction.description ??
												transaction.originalDescription ??
												"Transação pendente"}
										</p>
										<p className="text-muted-foreground text-xs">
											{formatDate(transaction.occurredOn)} ·{" "}
											{formatMoney(transaction.amountCents)}
										</p>
									</div>
								))}
								{pending.importRows.slice(0, 8).map((row) => {
									const batch = batchById.get(row.batchId);
									return (
										<Link
											className="rounded-md border bg-muted/20 p-4 transition hover:border-primary/50 hover:bg-muted/30"
											href={`/import?batchId=${row.batchId}`}
											key={`row-${row.id}`}
										>
											<p className="font-medium">
												{row.originalDescription ?? `Linha ${row.rowNumber}`}
											</p>
											<p className="text-muted-foreground text-xs">
												{batch?.originalFileName ?? "Importação"} · linha{" "}
												{row.rowNumber}
											</p>
										</Link>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>
			</section>
		</AppShell>
	);
}

function Sparkline({ values }: { values: number[] }) {
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 0);
	const span = Math.max(1, max - min);
	return (
		<div className="mt-3 flex h-8 items-end gap-1 rounded-md bg-muted p-1">
			{values.slice(0, 60).map((value) => (
				<div
					className="min-w-1 flex-1 rounded bg-primary"
					key={value}
					style={{ height: `${10 + ((value - min) / span) * 90}%` }}
				/>
			))}
		</div>
	);
}

function parseGranularity(value?: string): Granularity {
	if (
		value === "day" ||
		value === "week" ||
		value === "month" ||
		value === "year"
	)
		return value;
	return "day";
}

function parseWindow(
	params: CashFlowSearchParams | undefined,
	granularity: Granularity,
	today: string,
) {
	const preset = params?.windowPreset;
	const requestedStart = params?.windowStart;
	const requestedEnd = params?.windowEnd;
	const start = validDate(requestedStart) ? requestedStart : today;
	if (preset === "90d") return { start, end: addDays(start, 89) };
	if (preset === "6m") return { start, end: addMonths(start, 6) };
	if (preset === "12m") return { start, end: addMonths(start, 12) };
	if (preset === "custom" && validDate(requestedEnd))
		return { start, end: requestedEnd };
	if (preset === "30d") return { start, end: addDays(start, 29) };
	return defaultWindow(granularity, today);
}

function validDate(value?: string): value is string {
	return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isoToday() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateIso: string, days: number) {
	const date = parseDate(dateIso);
	date.setDate(date.getDate() + days);
	return formatIso(date);
}

function addMonths(dateIso: string, months: number) {
	const date = parseDate(dateIso);
	date.setMonth(date.getMonth() + months);
	return formatIso(date);
}

function parseDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatIso(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function consolidatedOpening(
	accounts: (typeof financialAccounts.$inferSelect)[],
	allTransactions: (typeof transactions.$inferSelect)[],
) {
	const balances = calculateAccountBalances(accounts, allTransactions);
	return accounts.reduce(
		(total, account) =>
			account.type === "credit_card" || account.type === "investment"
				? total
				: total + (balances.get(account.id)?.normalBalanceCents ?? 0),
		0,
	);
}

function minTimeline(timeline: ReturnType<typeof consolidatedTimeline>) {
	return timeline.reduce<{ date: string; balanceCents: number } | null>(
		(min, row) => {
			const candidate = { date: row.bucketEnd, balanceCents: row.closingCents };
			return !min || candidate.balanceCents < min.balanceCents
				? candidate
				: min;
		},
		null,
	);
}
