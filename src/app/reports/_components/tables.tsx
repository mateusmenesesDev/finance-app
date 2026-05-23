"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "~/components/data-table";
import { Money } from "~/components/money";

type ReportRow = Record<string, unknown>;

type ReportColumn = { key: string; label: string; money?: boolean };

export function SimpleTable({
	columns,
	rows,
}: {
	columns: ReportColumn[];
	rows: ReportRow[];
}) {
	const tableColumns: ColumnDef<ReportRow, unknown>[] = columns.map(
		(column) => ({
			accessorKey: column.key,
			header: column.label,
			cell: ({ row }) => {
				const value = row.original[column.key];
				if (column.money) return <Money cents={Number(value ?? 0)} />;
				return String(value ?? "");
			},
		}),
	);

	return (
		<DataTable
			className="mt-4"
			columns={tableColumns}
			data={rows}
			density="compact"
			emptyMessage="Sem linhas para exibir."
			enableColumnToggle={false}
			pageSize={10}
		/>
	);
}
