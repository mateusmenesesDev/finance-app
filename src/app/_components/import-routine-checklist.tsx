"use client";

import { CreditCard, Wallet } from "lucide-react";
import { useTransition } from "react";

import { toggleImportRoutineItemCompleted } from "~/app/_actions/import-routine-actions";
import type { ImportRoutineChecklistRow } from "~/lib/import-routine";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

export function ImportRoutineChecklist({
	cycleMonthKey,
	rows,
}: {
	cycleMonthKey: string;
	rows: ImportRoutineChecklistRow[];
}) {
	const [pending, startTransition] = useTransition();

	return (
		<ul
			className={cn(
				"grid gap-2",
				pending && "pointer-events-none opacity-70",
			)}
		>
			{rows.map((row) => (
				<li
					className="flex items-start gap-3 rounded-md border bg-muted/10 p-3"
					key={row.routineItemId}
				>
					<Checkbox
						aria-label={row.label}
						checked={row.completed}
						disabled={pending}
						id={`routine-item-${row.routineItemId}`}
						onCheckedChange={(checked) => {
							const nextCompleted = checked === true;
							startTransition(async () => {
								await toggleImportRoutineItemCompleted(
									row.routineItemId,
									cycleMonthKey,
									nextCompleted,
								);
							});
						}}
					/>
					<div className="min-w-0 flex-1">
						<label
							className="flex cursor-pointer items-center gap-2 font-medium text-sm"
							htmlFor={`routine-item-${row.routineItemId}`}
						>
							{row.kind === "account_statement" ? (
								<Wallet className="size-4 shrink-0 text-muted-foreground" />
							) : (
								<CreditCard className="size-4 shrink-0 text-muted-foreground" />
							)}
							<span className="truncate">{row.label}</span>
						</label>
						<p className="text-muted-foreground text-xs">
							{row.institution ?? "Sem instituição"}
						</p>
					</div>
				</li>
			))}
		</ul>
	);
}
