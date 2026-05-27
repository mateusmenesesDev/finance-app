"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { formatMoney } from "~/lib/formatters";

const money = (value: unknown) => formatMoney(Number(value) || 0);

const incomeExpenseConfig = {
	mainIncomeCents: { label: "Receita principal", color: "var(--chart-1)" },
	financialIncomeCents: {
		label: "Receita financeira",
		color: "var(--chart-2)",
	},
	expenseCents: { label: "Despesas", color: "var(--chart-5)" },
	netCents: { label: "Líquido", color: "var(--chart-3)" },
} satisfies ChartConfig;

const expenseConfig = {
	totalCents: { label: "Despesas", color: "var(--chart-5)" },
} satisfies ChartConfig;

const accountConfig = {
	inflowCents: { label: "Entradas", color: "var(--chart-1)" },
	outflowCents: { label: "Saídas", color: "var(--chart-5)" },
	netCents: { label: "Líquido", color: "var(--chart-3)" },
} satisfies ChartConfig;

const cardConfig = {
	totalCents: { label: "Faturas", color: "var(--chart-5)" },
} satisfies ChartConfig;

const budgetConfig = {
	plannedCents: { label: "Previsto", color: "var(--chart-4)" },
	spentCents: { label: "Realizado", color: "var(--chart-5)" },
} satisfies ChartConfig;

const cashFlowConfig = {
	realizedIncome: { label: "Receita realizada", color: "var(--chart-1)" },
	plannedIncome: { label: "Receita prevista", color: "var(--chart-3)" },
	realizedExpense: { label: "Despesa realizada", color: "var(--chart-5)" },
} satisfies ChartConfig;

type Row = Record<string, string | number | Record<string, number> | undefined>;

function EmptyChart({
	rows,
	children,
	config,
}: {
	rows: Row[];
	children: React.ReactElement;
	config: ChartConfig;
}) {
	if (rows.length === 0)
		return (
			<p className="text-muted-foreground text-sm">Sem dados para o período.</p>
		);
	return (
		<ChartContainer className="h-72 w-full" config={config}>
			{children}
		</ChartContainer>
	);
}

export function IncomeExpenseChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={incomeExpenseConfig} rows={rows}>
			<ComposedChart data={rows}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Bar dataKey="mainIncomeCents" fill="var(--color-mainIncomeCents)" />
				<Bar
					dataKey="financialIncomeCents"
					fill="var(--color-financialIncomeCents)"
				/>
				<Bar dataKey="expenseCents" fill="var(--color-expenseCents)" />
				<Line dataKey="netCents" stroke="var(--color-netCents)" />
			</ComposedChart>
		</EmptyChart>
	);
}

export function CategoryRankingChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={expenseConfig} rows={rows}>
			<BarChart data={rows} layout="vertical">
				<CartesianGrid horizontal={false} />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="name" type="category" width={120} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<Bar dataKey="totalCents" fill="var(--color-totalCents)" />
			</BarChart>
		</EmptyChart>
	);
}

export function GroupStackChart({ rows }: { rows: Row[] }) {
	return <CategoryRankingChart rows={rows} />;
}

export function AccountMovementChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={accountConfig} rows={rows}>
			<BarChart data={rows} layout="vertical">
				<CartesianGrid horizontal={false} />
				<XAxis tickFormatter={(v) => money(v)} type="number" />
				<YAxis dataKey="accountName" type="category" width={120} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Bar dataKey="inflowCents" fill="var(--color-inflowCents)" />
				<Bar dataKey="outflowCents" fill="var(--color-outflowCents)" />
				<Bar dataKey="netCents" fill="var(--color-netCents)" />
			</BarChart>
		</EmptyChart>
	);
}

export function CardInvoiceChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={cardConfig} rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="monthKey" />
				<YAxis tickFormatter={(v) => money(v)} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Bar dataKey="totalCents" fill="var(--color-totalCents)" />
			</BarChart>
		</EmptyChart>
	);
}

export function BudgetVsActualChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={budgetConfig} rows={rows}>
			<BarChart data={rows}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="name" />
				<YAxis tickFormatter={(v) => money(v)} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Bar dataKey="plannedCents" fill="var(--color-plannedCents)" />
				<Bar dataKey="spentCents" fill="var(--color-spentCents)" />
			</BarChart>
		</EmptyChart>
	);
}

export function CashFlowLineChart({ rows }: { rows: Row[] }) {
	return (
		<EmptyChart config={cashFlowConfig} rows={rows}>
			<LineChart data={rows}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="label" />
				<YAxis tickFormatter={(v) => money(v)} />
				<ChartTooltip
					content={<ChartTooltipContent valueFormatter={money} />}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Line dataKey="realizedIncome" stroke="var(--color-realizedIncome)" />
				<Line dataKey="plannedIncome" stroke="var(--color-plannedIncome)" />
				<Line dataKey="realizedExpense" stroke="var(--color-realizedExpense)" />
			</LineChart>
		</EmptyChart>
	);
}
