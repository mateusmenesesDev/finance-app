"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const money = (value: unknown) =>
	new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
		(Number(value) || 0) / 100,
	);
const chartColor = {
	bad: "var(--color-bad)",
	border: "var(--color-border-subtle)",
	good: "var(--color-good)",
	info: "var(--color-info)",
	warn: "var(--color-warn)",
};
const tooltip = {
	contentStyle: {
		background: "var(--color-surface)",
		borderColor: "var(--color-border)",
		color: "var(--color-text)",
	},
	formatter: money,
};

type Row = Record<string, string | number | Record<string, number> | undefined>;
function EmptyChart({
	rows,
	children,
}: {
	rows: Row[];
	children: React.ReactElement;
}) {
	if (rows.length === 0)
		return (
			<p className="text-[color:var(--color-text-subtle)] text-sm">
				Sem dados para o período.
			</p>
		);
	return (
		<ResponsiveContainer height={280} width="100%">
			{children}
		</ResponsiveContainer>
	);
}

export function IncomeExpenseChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<ComposedChart data={rows}>
				<CartesianGrid stroke={chartColor.border} />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="incomeCents" fill={chartColor.good} name="Receitas" />
				<Bar dataKey="expenseCents" fill={chartColor.bad} name="Despesas" />
				<Line dataKey="netCents" name="Líquido" stroke={chartColor.info} />
			</ComposedChart>
		</EmptyChart>
	);
}
export function CategoryRankingChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows} layout="vertical">
				<CartesianGrid stroke={chartColor.border} />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="name" type="category" width={120} />
				<Tooltip {...tooltip} />
				<Bar dataKey="totalCents" fill={chartColor.bad} name="Despesas" />
			</BarChart>
		</EmptyChart>
	);
}
export function GroupStackChart({ rows }: { rows: Row[] }) {
	return <CategoryRankingChart rows={rows} />;
}
export function AccountMovementChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows} layout="vertical">
				<CartesianGrid stroke={chartColor.border} />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="accountName" type="category" width={120} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="inflowCents" fill={chartColor.good} name="Entradas" />
				<Bar dataKey="outflowCents" fill={chartColor.bad} name="Saídas" />
				<Bar dataKey="netCents" fill={chartColor.info} name="Líquido" />
			</BarChart>
		</EmptyChart>
	);
}
export function CardInvoiceChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid stroke={chartColor.border} />
				<XAxis dataKey="monthKey" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="totalCents" fill={chartColor.bad} name="Faturas" />
			</BarChart>
		</EmptyChart>
	);
}
export function BudgetVsActualChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid stroke={chartColor.border} />
				<XAxis dataKey="name" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="plannedCents" fill={chartColor.warn} name="Previsto" />
				<Bar dataKey="spentCents" fill={chartColor.bad} name="Realizado" />
			</BarChart>
		</EmptyChart>
	);
}
export function CashFlowLineChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<LineChart data={rows}>
				<CartesianGrid stroke={chartColor.border} />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Line
					dataKey="realizedIncome"
					name="Receita realizada"
					stroke={chartColor.good}
				/>
				<Line
					dataKey="plannedIncome"
					name="Receita prevista"
					stroke={chartColor.info}
				/>
				<Line
					dataKey="realizedExpense"
					name="Despesa realizada"
					stroke={chartColor.bad}
				/>
			</LineChart>
		</EmptyChart>
	);
}
