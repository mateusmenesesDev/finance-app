"use client";

import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Columns3,
} from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

type Props<TData> = {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	/** Column id to filter via the search input. Omit to hide the search input. */
	searchColumn?: string;
	searchPlaceholder?: string;
	/** Show column visibility toggle. Default true. */
	enableColumnToggle?: boolean;
	enablePagination?: boolean;
	pageSize?: number;
	emptyMessage?: string;
	toolbar?: React.ReactNode;
	density?: "comfortable" | "compact";
	className?: string;
};

export function DataTable<TData>({
	columns,
	data,
	searchColumn,
	searchPlaceholder = "Filtrar...",
	enableColumnToggle = true,
	enablePagination = true,
	pageSize = 25,
	emptyMessage = "Nenhum resultado.",
	toolbar,
	density = "comfortable",
	className,
}: Props<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

	const table = useReactTable({
		data,
		columns,
		state: { sorting, columnFilters, columnVisibility },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: enablePagination
			? getPaginationRowModel()
			: undefined,
		initialState: enablePagination
			? { pagination: { pageSize, pageIndex: 0 } }
			: undefined,
	});

	const cellPadding = density === "compact" ? "px-3 py-2" : "px-4 py-3";

	return (
		<div className={cn("space-y-3", className)}>
			{(searchColumn || enableColumnToggle || toolbar) && (
				<div className="flex flex-wrap items-center gap-2">
					{searchColumn ? (
						<Input
							className="h-9 max-w-xs"
							onChange={(event) =>
								table
									.getColumn(searchColumn)
									?.setFilterValue(event.target.value)
							}
							placeholder={searchPlaceholder}
							value={
								(table.getColumn(searchColumn)?.getFilterValue() as string) ??
								""
							}
						/>
					) : null}
					{toolbar}
					{enableColumnToggle ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button className="ml-auto" size="sm" variant="outline">
									<Columns3 className="size-4" />
									Colunas
									<ChevronDown className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{table
									.getAllColumns()
									.filter((column) => column.getCanHide())
									.map((column) => (
										<DropdownMenuCheckboxItem
											checked={column.getIsVisible()}
											key={column.id}
											onCheckedChange={(value) =>
												column.toggleVisibility(!!value)
											}
										>
											{column.id}
										</DropdownMenuCheckboxItem>
									))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
			)}

			<div className="overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead
										className={cellPadding}
										key={header.id}
										style={
											header.column.columnDef.size
												? { width: header.column.columnDef.size }
												: undefined
										}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									data-state={row.getIsSelected() && "selected"}
									key={row.id}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell className={cellPadding} key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									className="h-24 text-center text-muted-foreground"
									colSpan={columns.length}
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{enablePagination && table.getPageCount() > 1 ? (
				<div className="flex items-center justify-between gap-2 text-muted-foreground text-sm">
					<span>
						Página {table.getState().pagination.pageIndex + 1} de{" "}
						{table.getPageCount()} · {table.getFilteredRowModel().rows.length}{" "}
						item(s)
					</span>
					<div className="flex items-center gap-1">
						<Button
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.setPageIndex(0)}
							size="icon"
							variant="outline"
						>
							<ChevronsLeft className="size-4" />
						</Button>
						<Button
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
							size="icon"
							variant="outline"
						>
							<ChevronLeft className="size-4" />
						</Button>
						<Button
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
							size="icon"
							variant="outline"
						>
							<ChevronRight className="size-4" />
						</Button>
						<Button
							disabled={!table.getCanNextPage()}
							onClick={() => table.setPageIndex(table.getPageCount() - 1)}
							size="icon"
							variant="outline"
						>
							<ChevronsRight className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
