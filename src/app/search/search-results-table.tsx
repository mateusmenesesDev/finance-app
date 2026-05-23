"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTable } from "~/components/data-table";
import { Money } from "~/components/money";
import { Badge } from "~/components/ui/badge";
import { formatDate } from "~/lib/formatters";
import { cn } from "~/lib/utils";

export type SearchTransactionRow = {
	id: number;
	description: string;
	occurredOn: string;
	amountCents: number;
	movementType: string;
	status: string;
	categoryName: string | null;
	accountName: string | null;
	query: string;
};

const statusLabels: Record<string, string> = {
	planned: "Prevista",
	confirmed: "Confirmada",
	ignored: "Ignorada",
	duplicate: "Duplicada",
	pending_review: "Pendente de revisão",
};

export function SearchTransactionsTable({
	rows,
}: {
	rows: SearchTransactionRow[];
}) {
	const columns: ColumnDef<SearchTransactionRow, unknown>[] = [
		{
			accessorKey: "description",
			header: "Descrição",
			cell: ({ row }) => (
				<Link
					className="font-medium hover:text-primary"
					href={`/transactions?q=${encodeURIComponent(row.original.query)}`}
				>
					{row.original.description}
				</Link>
			),
		},
		{
			accessorKey: "occurredOn",
			header: "Data",
			cell: ({ row }) => formatDate(row.original.occurredOn),
		},
		{
			accessorKey: "accountName",
			header: "Conta",
			cell: ({ row }) => row.original.accountName ?? "—",
		},
		{
			accessorKey: "categoryName",
			header: "Categoria",
			cell: ({ row }) => row.original.categoryName ?? "—",
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			accessorKey: "amountCents",
			header: "Valor",
			cell: ({ row }) => (
				<Money
					cents={row.original.amountCents}
					sign={row.original.movementType === "income" ? "credit" : "debit"}
				/>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={rows}
			density="compact"
			emptyMessage="Nada encontrado."
			pageSize={20}
			searchColumn="description"
			searchPlaceholder="Filtrar transações..."
		/>
	);
}

function StatusBadge({ status }: { status: string }) {
	const variant =
		status === "confirmed"
			? "default"
			: status === "ignored"
				? "outline"
				: status === "duplicate"
					? "destructive"
					: "secondary";
	return (
		<Badge
			className={cn(
				status === "pending_review" &&
					"border-warning/40 bg-warning/10 text-warning",
			)}
			variant={variant}
		>
			{statusLabels[status] ?? status}
		</Badge>
	);
}
