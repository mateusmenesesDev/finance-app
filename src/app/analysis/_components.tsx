import { Panel } from "~/app/_components/finance-ui";
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
		<Panel title={title}>
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
		</Panel>
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
				<span className="truncate text-slate-200">{label}</span>
				<span className="font-medium text-slate-100">{formatMoney(value)}</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-slate-800">
				<div
					className="h-full rounded-full bg-emerald-400"
					style={{
						width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%`,
					}}
				/>
			</div>
			{detail ? <p className="mt-1 text-slate-500 text-xs">{detail}</p> : null}
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
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-left text-slate-400">
						<th className="py-2">Mês</th>
						<th>Receitas</th>
						<th>Despesas</th>
						<th>Saldo</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr className="border-slate-800 border-t" key={row.monthKey}>
							<td className="py-3">{row.monthKey}</td>
							<td>
								<MiniBar max={max} value={row.incomeCents} />
							</td>
							<td>
								<MiniBar max={max} value={row.expenseCents} />
							</td>
							<td>
								<MiniBar max={max} value={row.netCents} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
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
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-slate-400">
								<th className="py-2">Nome</th>
								<th>Atual</th>
								<th>Anterior</th>
								<th>Média 6m</th>
								<th>Ano passado</th>
								<th>% mês ant.</th>
							</tr>
						</thead>
						<tbody>
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
									<tr
										className="border-slate-800 border-t"
										key={row.categoryName ?? row.groupName}
									>
										<td className="py-3">
											{row.categoryName ?? row.groupName}
										</td>
										<td>{formatMoney(current)}</td>
										<td>{formatMoney(previous)}</td>
										<td>{formatMoney(avg)}</td>
										<td>{yoy === null ? "—" : formatMoney(yoy)}</td>
										<td>{pct === null ? "—" : safePercent(pct)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function MiniBar({ value, max }: { value: number; max: number }) {
	return (
		<div className="min-w-36">
			<span className={value < 0 ? "text-rose-300" : "text-slate-100"}>
				{formatMoney(value)}
			</span>
			<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
				<div
					className="h-full rounded-full bg-emerald-400"
					style={{ width: `${max > 0 ? Math.abs(value / max) * 100 : 0}%` }}
				/>
			</div>
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
		<Panel title={title}>
			{rows.length === 0 ? (
				<Empty />
			) : (
				<div className="space-y-3">
					{rows.map((row) => (
						<div
							className="rounded-2xl bg-slate-950/60 p-3"
							key={`${row.label}-${row.value}`}
						>
							<div className="flex justify-between gap-3">
								<p className="font-medium">{row.label}</p>
								<p className="text-slate-100">{row.value}</p>
							</div>
							{row.detail ? (
								<p className="mt-1 text-slate-500 text-xs">{row.detail}</p>
							) : null}
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}

export function Empty() {
	return <p className="text-slate-500 text-sm">Sem dados no período.</p>;
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
