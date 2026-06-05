"use client";

import { CreditCard, Wallet } from "lucide-react";

import type { ImportRoutineChecklistRow } from "~/lib/import-routine";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

export function ImportRoutineChecklist({
	rows,
	compact = false,
	grouped = false,
	onToggle,
}: {
	rows: ImportRoutineChecklistRow[];
	compact?: boolean;
	grouped?: boolean;
	onToggle: (routineItemId: number, completed: boolean) => void;
}) {
	const statementRows = rows.filter((row) => row.kind === "account_statement");
	const invoiceRows = rows.filter((row) => row.kind === "card_invoice");

	function renderRow(row: ImportRoutineChecklistRow) {
		const shortName = row.label.replace(/^[^:]+:\s*/, "");

		return (
			<li
				className={cn(
					"flex items-start gap-3 rounded-md border p-3",
					row.kind === "account_statement"
						? "border-sky-500/25 bg-sky-500/5"
						: "border-violet-500/25 bg-violet-500/5",
					compact && "py-2",
				)}
				key={row.routineItemId}
			>
				<Checkbox
					aria-label={row.label}
					checked={row.completed}
					id={`routine-item-${row.routineItemId}`}
					onCheckedChange={(checked) => {
						onToggle(row.routineItemId, checked === true);
					}}
				/>
				<div className="min-w-0 flex-1">
					<label
						className="flex cursor-pointer flex-wrap items-center gap-2 font-medium text-sm"
						htmlFor={`routine-item-${row.routineItemId}`}
					>
						{row.kind === "account_statement" ? (
							<Wallet className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
						) : (
							<CreditCard className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
						)}
						<Badge
							className="shrink-0"
							variant={
								row.kind === "account_statement" ? "secondary" : "outline"
							}
						>
							{row.kind === "account_statement" ? "Extrato" : "Fatura"}
						</Badge>
						<span className="truncate">{shortName}</span>
					</label>
					{compact ? null : (
						<p className="text-muted-foreground text-xs">
							{row.institution ?? "Sem instituição"}
						</p>
					)}
				</div>
			</li>
		);
	}

	function renderSection(
		title: string,
		sectionRows: ImportRoutineChecklistRow[],
	) {
		if (sectionRows.length === 0) return null;
		return (
			<div className="grid gap-2">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{title}
				</p>
				<ul className="grid gap-2">{sectionRows.map(renderRow)}</ul>
			</div>
		);
	}

	return grouped ? (
		<div className="grid gap-4">
			{renderSection("Extratos", statementRows)}
			{renderSection("Faturas", invoiceRows)}
		</div>
	) : (
		<ul className="grid gap-2">{rows.map(renderRow)}</ul>
	);
}
