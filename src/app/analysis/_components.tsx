import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { MonthlyAmountPoint } from "~/lib/analysis";
import type { MonthPeriod } from "~/lib/finance-rules";
import { formatMoney, formatPercent } from "~/lib/formatters";

export function RankingPanel({
	title,
	rows,
}: {
	title: string;
	rows: { label: string; value: number; detail?: string }[];
}) {
	const max = Math.max(0, ...rows.map((row) => row.value));
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<Empty />
				) : (
					<div className="space-y-3">
						{rows.map((row) => (
							<BarRow
								detail={row.detail}
								key={row.label}
								label={row.label}
								max={max}
								value={row.value}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function BarRow({
	label,
	value,
	max,
	detail,
}: {
	label: string;
	value: number;
	max: number;
	detail?: string;
}) {
	return (
		<div>
			<div className="mb-1 flex justify-between gap-3 text-sm">
				<span className="truncate text-foreground">{label}</span>
				<Money cents={value} className="font-medium" />
			</div>
			<Progress value={max > 0 ? Math.max(4, (value / max) * 100) : 0} />
			{detail ? (
				<p className="mt-1 text-muted-foreground text-xs">{detail}</p>
			) : null}
		</div>
	);
}

export function TotalsTable({
	rows,
}: {
	rows: {
		monthKey: string;
		incomeCents: number;
		expenseCents: number;
		netCents: number;
	}[];
}) {
	const max = Math.max(
		0,
		...rows.map((row) =>
			Math.max(row.incomeCents, row.expenseCents, Math.abs(row.netCents)),
		),
	);
	return (
		<div className="overflow-hidden rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Mês</TableHead>
						<TableHead>Receitas</TableHead>
						<TableHead>Despesas</TableHead>
						<TableHead>Saldo</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.monthKey}>
							<TableCell>{row.monthKey}</TableCell>
							<TableCell>
								<MiniBar max={max} value={row.incomeCents} />
							</TableCell>
							<TableCell>
								<MiniBar max={max} value={row.expenseCents} />
							</TableCell>
							<TableCell>
								<MiniBar max={max} value={row.netCents} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function SeriesTable({
	title,
	rows,
	period,
}: {
	title: string;
	rows: {
		categoryName?: string;
		groupName?: string;
		series: MonthlyAmountPoint[];
	}[];
	period: MonthPeriod;
}) {
	return (
		<div>
			<h3 className="mb-3 font-semibold">{title}</h3>
			{rows.length === 0 ? (
				<Empty />
			) : (
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Atual</TableHead>
								<TableHead>Anterior</TableHead>
								<TableHead>Média 6m</TableHead>
								<TableHead>Ano passado</TableHead>
								<TableHead>% mês ant.</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const current =
									row.series.find((point) => point.monthKey === period.key)
										?.amountCents ?? 0;
								const previous = row.series.at(-2)?.amountCents ?? 0;
								const six = row.series.slice(-6);
								const avg =
									six.length > 0
										? Math.round(
												six.reduce((sum, point) => sum + point.amountCents, 0) /
													six.length,
											)
										: 0;
								const yoy =
									row.series.find(
										(point) =>
											point.monthKey ===
											`${Number(period.key.slice(0, 4)) - 1}${period.key.slice(4)}`,
									)?.amountCents ?? null;
								const pct =
									previous === 0 ? null : (current - previous) / previous;
								return (
									<TableRow key={row.categoryName ?? row.groupName}>
										<TableCell>{row.categoryName ?? row.groupName}</TableCell>
										<TableCell>{formatMoney(current)}</TableCell>
										<TableCell>{formatMoney(previous)}</TableCell>
										<TableCell>{formatMoney(avg)}</TableCell>
										<TableCell>
											{yoy === null ? "—" : formatMoney(yoy)}
										</TableCell>
										<TableCell>
											{pct === null ? "—" : safePercent(pct)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function MiniBar({ value, max }: { value: number; max: number }) {
	return (
		<div className="min-w-36">
			<Money
				cents={value}
				sign={value < 0 ? "debit" : "neutral"}
				tone={value < 0 ? "auto" : "neutral"}
			/>
			<Progress
				className="mt-1 h-1.5"
				value={max > 0 ? Math.abs(value / max) * 100 : 0}
			/>
		</div>
	);
}

export function InsightList({
	title,
	rows,
}: {
	title: string;
	rows: { label: string; value: string; detail?: string }[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<Empty />
				) : (
					<div className="space-y-3">
						{rows.map((row) => (
							<div
								className="rounded-md border bg-muted/20 p-3"
								key={`${row.label}-${row.value}`}
							>
								<div className="flex justify-between gap-3">
									<p className="font-medium">{row.label}</p>
									<p className="text-foreground">{row.value}</p>
								</div>
								{row.detail ? (
									<p className="mt-1 text-muted-foreground text-xs">
										{row.detail}
									</p>
								) : null}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function Empty() {
	return <EmptyState className="py-8" title="Sem dados no período." />;
}

export function comparisonText(
	comparison: { deltaCents: number; percent: number | null } | null,
) {
	if (!comparison) return "Sem referência anterior";
	const percent =
		comparison.percent === null ? "sem base" : safePercent(comparison.percent);
	return `${formatMoney(comparison.deltaCents)} vs mês anterior · ${percent}`;
}

export function safePercent(value: number | null) {
	return value === null || !Number.isFinite(value) ? "—" : formatPercent(value);
}

export function sourceLabel(source: string) {
	return (
		{
			subscription: "assinatura",
			grower: "crescimento",
			small_recurring: "pequeno recorrente",
		}[source] ?? source
	);
}
