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
const tooltip = { formatter: money };

type Row = Record<string, string | number | Record<string, number> | undefined>;
function EmptyChart({
	rows,
	children,
}: {
	rows: Row[];
	children: React.ReactElement;
}) {
	if (rows.length === 0)
		return <p className="text-slate-500 text-sm">Sem dados para o período.</p>;
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
				<CartesianGrid stroke="#1e293b" />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="incomeCents" fill="#34d399" name="Receitas" />
				<Bar dataKey="expenseCents" fill="#f87171" name="Despesas" />
				<Line dataKey="netCents" name="Líquido" stroke="#60a5fa" />
			</ComposedChart>
		</EmptyChart>
	);
}
export function CategoryRankingChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows} layout="vertical">
				<CartesianGrid stroke="#1e293b" />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="name" type="category" width={120} />
				<Tooltip {...tooltip} />
				<Bar dataKey="totalCents" fill="#f87171" name="Despesas" />
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
				<CartesianGrid stroke="#1e293b" />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="accountName" type="category" width={120} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="inflowCents" fill="#34d399" name="Entradas" />
				<Bar dataKey="outflowCents" fill="#f87171" name="Saídas" />
				<Bar dataKey="netCents" fill="#60a5fa" name="Líquido" />
			</BarChart>
		</EmptyChart>
	);
}
export function CardInvoiceChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid stroke="#1e293b" />
				<XAxis dataKey="monthKey" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="totalCents" fill="#f87171" name="Faturas" />
			</BarChart>
		</EmptyChart>
	);
}
export function BudgetVsActualChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid stroke="#1e293b" />
				<XAxis dataKey="name" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Bar dataKey="plannedCents" fill="#fbbf24" name="Previsto" />
				<Bar dataKey="spentCents" fill="#f87171" name="Realizado" />
			</BarChart>
		</EmptyChart>
	);
}
export function CashFlowLineChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart rows={rows}>
			<LineChart data={rows}>
				<CartesianGrid stroke="#1e293b" />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<Tooltip {...tooltip} />
				<Legend />
				<Line
					dataKey="realizedIncome"
					name="Receita realizada"
					stroke="#34d399"
				/>
				<Line
					dataKey="plannedIncome"
					name="Receita prevista"
					stroke="#60a5fa"
				/>
				<Line
					dataKey="realizedExpense"
					name="Despesa realizada"
					stroke="#f87171"
				/>
			</LineChart>
		</EmptyChart>
	);
}
