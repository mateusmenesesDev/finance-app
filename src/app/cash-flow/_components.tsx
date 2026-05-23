"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "~/components/data-table";
import { formatMoney } from "~/lib/formatters";

export type TimelineRow = {
	bucketKey: string;
	period: string;
	realized: number;
	planned: number;
	invoiceOutflow: number;
	closingCents: number;
};

export type ComparisonRow = {
	key: string;
	plannedCents: number;
	realizedCents: number;
	deltaCents: number;
	deltaPercent: string;
};

export function TimelineTable({ rows }: { rows: TimelineRow[] }) {
	const columns: ColumnDef<TimelineRow, unknown>[] = [
		{ accessorKey: "period", header: "Período" },
		{
			accessorKey: "realized",
			header: "Realizado",
			cell: ({ row }) => formatMoney(row.original.realized),
		},
		{
			accessorKey: "planned",
			header: "Previsto",
			cell: ({ row }) => formatMoney(row.original.planned),
		},
		{
			accessorKey: "invoiceOutflow",
			header: "Fatura",
			cell: ({ row }) => formatMoney(row.original.invoiceOutflow),
		},
		{
			accessorKey: "closingCents",
			header: "Saldo acumulado",
			cell: ({ row }) => formatMoney(row.original.closingCents),
		},
	];
	return (
		<DataTable
			columns={columns}
			data={rows}
			density="compact"
			emptyMessage="Nenhum bucket no período selecionado."
			enableColumnToggle={false}
			pageSize={12}
		/>
	);
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
	const columns: ColumnDef<ComparisonRow, unknown>[] = [
		{ accessorKey: "key", header: "Período" },
		{
			accessorKey: "plannedCents",
			header: "Previsto",
			cell: ({ row }) => formatMoney(row.original.plannedCents),
		},
		{
			accessorKey: "realizedCents",
			header: "Realizado",
			cell: ({ row }) => formatMoney(row.original.realizedCents),
		},
		{
			accessorKey: "deltaCents",
			header: "Δ R$",
			cell: ({ row }) => formatMoney(row.original.deltaCents),
		},
		{ accessorKey: "deltaPercent", header: "Δ %" },
	];
	return (
		<DataTable
			columns={columns}
			data={rows}
			density="compact"
			emptyMessage="Sem dados para exibir."
			enableColumnToggle={false}
			enablePagination={false}
		/>
	);
}
