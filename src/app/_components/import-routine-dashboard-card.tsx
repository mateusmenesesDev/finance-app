"use client";

import { ChevronDown } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { toggleImportRoutineItemCompleted } from "~/app/_actions/import-routine-actions";
import { ImportRoutineChecklist } from "~/app/_components/import-routine-checklist";
import type { ImportRoutineChecklistRow } from "~/lib/import-routine";
import { routineProgressFromChecklist } from "~/lib/import-routine";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";

type ToggleAction = {
	routineItemId: number;
	completed: boolean;
};

function applyToggle(
	rows: ImportRoutineChecklistRow[],
	action: ToggleAction,
) {
	return rows.map((row) =>
		row.routineItemId === action.routineItemId
			? { ...row, completed: action.completed }
			: row,
	);
}

type ImportRoutineDashboardCardProps = {
	cycleMonthKey: string;
	cycleLabel: string;
	referenceSuffix: string | null;
	rows: ImportRoutineChecklistRow[];
	highlightDayOne: boolean;
	defaultCompact: boolean;
};

export function ImportRoutineDashboardCard({
	cycleMonthKey,
	cycleLabel,
	referenceSuffix,
	rows,
	highlightDayOne,
	defaultCompact,
}: ImportRoutineDashboardCardProps) {
	const [expanded, setExpanded] = useState(!defaultCompact);
	const [optimisticRows, setOptimisticRows] = useOptimistic(rows, applyToggle);
	const [, startTransition] = useTransition();
	const progress = routineProgressFromChecklist(optimisticRows);
	const isCompact = defaultCompact && !expanded;
	const progressPercent =
		progress.totalCount > 0
			? (progress.completedCount / progress.totalCount) * 100
			: 0;

	function handleToggle(routineItemId: number, completed: boolean) {
		startTransition(async () => {
			setOptimisticRows({ routineItemId, completed });
			await toggleImportRoutineItemCompleted(
				routineItemId,
				cycleMonthKey,
				completed,
			);
		});
	}

	return (
		<Card
			className={cn(
				highlightDayOne &&
					"border-primary/60 bg-primary/5 shadow-sm ring-2 ring-primary/20",
			)}
		>
			<CardHeader className={cn(isCompact && "pb-3")}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className={cn(isCompact && "text-base")}>
								Rotina de importação
							</CardTitle>
							{highlightDayOne ? (
								<Badge variant="default">Hoje é dia 1</Badge>
							) : null}
						</div>
						<CardDescription>
							Ciclo de {cycleLabel}
							{referenceSuffix}
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{progress.completedCount}/{progress.totalCount}
						</Badge>
						{progress.isFullyComplete ? (
							<Badge variant="outline">Ciclo concluído</Badge>
						) : null}
						{defaultCompact ? (
							<Button
								aria-expanded={expanded}
								onClick={() => setExpanded((value) => !value)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<ChevronDown
									className={cn(
										"size-4 transition-transform",
										expanded && "rotate-180",
									)}
								/>
								<span className="sr-only">
									{expanded ? "Recolher rotina" : "Expandir rotina"}
								</span>
							</Button>
						) : null}
					</div>
				</div>
				{progress.totalCount > 0 && !isCompact ? (
					<Progress className="mt-3 h-2" value={progressPercent} />
				) : null}
			</CardHeader>
			<CardContent className={cn(isCompact && "pt-0")}>
				{isCompact ? (
					<p className="mb-3 text-muted-foreground text-xs">
						{progress.completedCount}/{progress.totalCount} concluídos — marque
						para ajustar
					</p>
				) : null}
				<ImportRoutineChecklist
					compact={isCompact}
					grouped={!isCompact}
					onToggle={handleToggle}
					rows={optimisticRows}
				/>
			</CardContent>
		</Card>
	);
}
