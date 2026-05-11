import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	FinanceShell,
	Panel,
	Select,
	SubmitButton,
	SummaryCard,
	TextInput,
} from "~/app/_components/finance-ui";
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
import { calculateAccountBalances } from "~/lib/finance-rules";
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
		(account) => account.type !== "credit_card",
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
	const finalConsolidated =
		timeline.at(-1)?.closingCents ??
		consolidatedOpening(allAccounts, allTransactions);
	const minConsolidated = minTimeline(timeline);
	const plannedIncome = aggregate.totals.plannedIncome;
	const plannedExpense =
		aggregate.totals.plannedExpense + aggregate.totals.invoiceOutflow;

	return (
		<FinanceShell
			description="Projete entradas, saídas, faturas e risco de saldo negativo sem misturar realizado, previsto e pendente."
			eyebrow="Fluxo de caixa"
			title="Fluxo de caixa"
		>
			<Panel title="Filtros do fluxo">
				<form className="grid gap-4 md:grid-cols-5 md:items-end">
					<label
						className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
						htmlFor="granularity"
					>
						Granularidade
						<Select
							defaultValue={granularity}
							id="granularity"
							name="granularity"
							options={granularityOptions}
						/>
					</label>
					<label
						className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
						htmlFor="windowPreset"
					>
						Janela
						<Select
							defaultValue={params?.windowPreset ?? "30d"}
							id="windowPreset"
							name="windowPreset"
							options={presetOptions}
						/>
					</label>
					<label
						className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
						htmlFor="windowStart"
					>
						Início livre
						<TextInput
							defaultValue={window.start}
							id="windowStart"
							name="windowStart"
							type="date"
						/>
					</label>
					<label
						className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
						htmlFor="accountId"
					>
						Conta
						<Select
							defaultValue={String(selectedAccountFilter)}
							id="accountId"
							name="accountId"
							options={accountOptions}
						/>
					</label>
					<input name="windowEnd" type="hidden" value={window.end} />
					<SubmitButton>Atualizar</SubmitButton>
				</form>
				<p className="mt-4 text-[color:var(--color-text-subtle)] text-xs">
					Período: {formatDate(window.start)} – {formatDate(window.end)}.
				</p>
			</Panel>

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<SummaryCard
					label="Entradas previstas"
					value={formatMoney(plannedIncome)}
					variant="good"
				/>
				<SummaryCard
					label="Saídas previstas"
					value={formatMoney(plannedExpense)}
					variant="bad"
				/>
				<SummaryCard
					label="Saldo projetado consolidado"
					value={formatMoney(finalConsolidated)}
					variant={finalConsolidated >= 0 ? "good" : "bad"}
				/>
				<SummaryCard
					description={
						minConsolidated ? formatDate(minConsolidated.date) : undefined
					}
					label="Mínimo projetado"
					value={formatMoney(
						minConsolidated?.balanceCents ?? finalConsolidated,
					)}
					variant={
						(minConsolidated?.balanceCents ?? finalConsolidated) >= 0
							? "default"
							: "bad"
					}
				/>
			</section>

			<Panel title="Saldo projetado por conta">
				{accountProjections.length > 0 ? (
					<div className="grid gap-3">
						{accountProjections.map((projection) => (
							<div
								className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
								key={projection.accountId}
							>
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="font-medium">{projection.accountName}</p>
										<p className="text-[color:var(--color-text-subtle)] text-xs">
											Mínimo {formatMoney(projection.minCents)} em{" "}
											{formatDate(projection.minDate)}
										</p>
									</div>
									<p className="font-semibold">
										{formatMoney(projection.closingProjectedCents)}
									</p>
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
					<EmptyState text="Nenhuma conta normal ativa para projetar." />
				)}
			</Panel>

			<Panel
				description="Consolidado inclui faturas futuras; saldos por banco não assumem qual conta pagará o cartão."
				title="Linha do tempo"
			>
				{timeline.length > 0 ? (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-[color:var(--color-text-muted)]">
								<tr>
									<th className="py-2 pr-4">Período</th>
									<th className="py-2 pr-4">Realizado</th>
									<th className="py-2 pr-4">Previsto</th>
									<th className="py-2 pr-4">Fatura</th>
									<th className="py-2 pr-4">Saldo acumulado</th>
								</tr>
							</thead>
							<tbody>
								{timeline.map((row, index) => {
									const bucket = aggregate.buckets[index];
									return (
										<tr
											className="border-[color:var(--color-border-subtle)] border-t"
											key={row.bucketKey}
										>
											<td className="py-3 pr-4">
												{formatDate(row.bucketStart)} –{" "}
												{formatDate(row.bucketEnd)}
											</td>
											<td className="py-3 pr-4">{formatMoney(row.realized)}</td>
											<td className="py-3 pr-4">
												{formatMoney(
													row.planned + (bucket?.invoiceOutflow ?? 0),
												)}
											</td>
											<td className="py-3 pr-4">
												{formatMoney(bucket?.invoiceOutflow ?? 0)}
											</td>
											<td className="py-3 pr-4 font-semibold">
												{formatMoney(row.closingCents)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState text="Nenhum bucket no período selecionado." />
				)}
			</Panel>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel title="Faturas futuras de cartão">
					{invoices.length > 0 ? (
						<div className="grid gap-3">
							{invoices.map((invoice) => (
								<div
									className="flex items-start justify-between gap-4 rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={`${invoice.accountId}-${invoice.key}`}
								>
									<div>
										<p className="font-medium">{invoice.accountName}</p>
										<p className="text-[color:var(--color-text-subtle)] text-xs">
											Vence {formatDate(invoice.dueDate)} · pago{" "}
											{formatMoney(invoice.paidCents)}
										</p>
									</div>
									<p className="font-semibold text-[color:var(--color-bad)]">
										{formatMoney(invoice.remainingCents)}
									</p>
								</div>
							))}
						</div>
					) : (
						<EmptyState text="Nenhuma fatura futura aberta na janela." />
					)}
				</Panel>

				<Panel title="Alertas de saldo">
					{alerts.length > 0 ? (
						<div className="grid gap-3">
							{alerts.map((alert) => (
								<div
									className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-4 text-[color:var(--color-bad)]"
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
						<EmptyState text="Nenhum risco de saldo negativo na janela." />
					)}
				</Panel>
			</section>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel title="Previsto vs Realizado">
					<SimpleTable
						headers={["Período", "Previsto", "Realizado", "Δ R$", "Δ %"]}
						rows={comparison.map((row) => [
							row.key,
							formatMoney(row.plannedCents),
							formatMoney(row.realizedCents),
							formatMoney(row.deltaCents),
							row.deltaPercent === null ? "—" : formatPercent(row.deltaPercent),
						])}
					/>
				</Panel>

				<Panel title="Pendente de revisão">
					{pending.transactionCount === 0 && pending.importRowCount === 0 ? (
						<EmptyState text="Nada pendente de revisão." />
					) : (
						<div className="grid gap-3 text-sm">
							{pending.transactions.slice(0, 6).map((transaction) => (
								<div
									className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
									key={`tx-${transaction.id}`}
								>
									<p className="font-medium">
										{transaction.description ??
											transaction.originalDescription ??
											"Transação pendente"}
									</p>
									<p className="text-[color:var(--color-text-subtle)] text-xs">
										{formatDate(transaction.occurredOn)} ·{" "}
										{formatMoney(transaction.amountCents)}
									</p>
								</div>
							))}
							{pending.importRows.slice(0, 8).map((row) => {
								const batch = batchById.get(row.batchId);
								return (
									<Link
										className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 transition hover:border-[color:var(--color-border)]"
										href={`/import?batchId=${row.batchId}`}
										key={`row-${row.id}`}
									>
										<p className="font-medium">
											{row.originalDescription ?? `Linha ${row.rowNumber}`}
										</p>
										<p className="text-[color:var(--color-text-subtle)] text-xs">
											{batch?.originalFileName ?? "Importação"} · linha{" "}
											{row.rowNumber}
										</p>
									</Link>
								);
							})}
						</div>
					)}
				</Panel>
			</section>
		</FinanceShell>
	);
}

function Sparkline({ values }: { values: number[] }) {
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 0);
	const span = Math.max(1, max - min);
	return (
		<div className="mt-3 flex h-8 items-end gap-1 rounded-xl bg-[color:var(--color-surface)] p-1">
			{values.slice(0, 60).map((value) => (
				<div
					className="min-w-1 flex-1 rounded bg-[color:var(--color-accent)]"
					key={value}
					style={{ height: `${10 + ((value - min) / span) * 90}%` }}
				/>
			))}
		</div>
	);
}

function SimpleTable({
	headers,
	rows,
}: {
	headers: string[];
	rows: string[][];
}) {
	if (rows.length === 0) return <EmptyState text="Sem dados para exibir." />;
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-left text-sm">
				<thead className="text-[color:var(--color-text-muted)]">
					<tr>
						{headers.map((header) => (
							<th className="py-2 pr-4" key={header}>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							className="border-[color:var(--color-border-subtle)] border-t"
							key={row.join(":")}
						>
							{headers.map((header, index) => (
								<td className="py-3 pr-4" key={header}>
									{row[index]}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
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
			account.type === "credit_card"
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
