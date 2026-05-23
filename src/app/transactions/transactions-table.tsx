"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil } from "lucide-react";
import { useRef } from "react";

import { quickCategorizeTransaction } from "~/app/_actions/finance-actions";
import { DataTable } from "~/components/data-table";
import { Money } from "~/components/money";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatDate, formatMoneyInput } from "~/lib/formatters";
import { cn } from "~/lib/utils";

export type SelectOption = { id: number; name: string; kind?: string };

export type TransactionRow = {
	id: number;
	accountId: number;
	destinationAccountId: number | null;
	categoryId: number | null;
	movementType: string;
	status: string;
	amountCents: number;
	occurredOn: string;
	description: string;
	originalDescription: string | null;
	notes: string | null;
	accountName: string;
	categoryName: string | null;
};

type Props = {
	rows: TransactionRow[];
	accounts: SelectOption[];
	categories: SelectOption[];
	updateAction: (formData: FormData) => void | Promise<void>;
	archiveAction: (formData: FormData) => void | Promise<void>;
};

const movementLabels: Record<string, string> = {
	income: "Receita",
	expense: "Despesa",
	transfer: "Transferência",
	credit_card_payment: "Pagamento de fatura",
	balance_adjustment: "Ajuste de saldo",
};

const statusLabels: Record<string, string> = {
	planned: "Prevista",
	confirmed: "Confirmada",
	ignored: "Ignorada",
	duplicate: "Duplicada",
	pending_review: "Pendente de revisão",
};

export function TransactionsTable({
	rows,
	accounts,
	categories,
	updateAction,
	archiveAction,
}: Props) {
	const columns: ColumnDef<TransactionRow, unknown>[] = [
		{
			id: "selecionar",
			header: "",
			enableHiding: false,
			size: 44,
			cell: ({ row }) => (
				<input
					aria-label={`Selecionar transação ${row.original.description}`}
					className="size-4 rounded border-input"
					form="bulk-edit-transactions"
					name="transactionId"
					type="checkbox"
					value={row.original.id}
				/>
			),
		},
		{
			accessorKey: "occurredOn",
			header: "Data",
			cell: ({ row }) => formatDate(row.original.occurredOn),
		},
		{
			accessorKey: "description",
			header: "Descrição",
			cell: ({ row }) => (
				<div className="min-w-48">
					<div className="font-medium">{row.original.description}</div>
					{row.original.originalDescription ? (
						<div className="text-muted-foreground text-xs">
							{row.original.originalDescription}
						</div>
					) : null}
				</div>
			),
		},
		{ accessorKey: "accountName", header: "Conta" },
		{
			accessorKey: "categoryName",
			header: "Categoria",
			cell: ({ row }) => row.original.categoryName ?? "—",
		},
		{
			accessorKey: "movementType",
			header: "Tipo",
			cell: ({ row }) =>
				movementLabels[row.original.movementType] ?? row.original.movementType,
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
		{
			id: "ações",
			header: "",
			enableHiding: false,
			cell: ({ row }) => (
				<RowActions
					accounts={accounts}
					archiveAction={archiveAction}
					categories={categories}
					row={row.original}
					updateAction={updateAction}
				/>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={rows}
			density="compact"
			emptyMessage="Nenhuma transação no filtro atual."
			pageSize={25}
			searchColumn="description"
			searchPlaceholder="Filtrar descrição na tabela..."
		/>
	);
}

type RowActionProps = Omit<Props, "rows"> & { row: TransactionRow };

function RowActions({
	row,
	accounts,
	categories,
	updateAction,
	archiveAction,
}: RowActionProps) {
	return (
		<Dialog>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="Abrir ações da transação"
						size="icon"
						variant="ghost"
					>
						<MoreHorizontal className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DialogTrigger asChild>
						<DropdownMenuItem onSelect={(event) => event.preventDefault()}>
							<Pencil className="size-4" />
							Editar
						</DropdownMenuItem>
					</DialogTrigger>
					{row.movementType === "income" || row.movementType === "expense" ? (
						<DropdownMenuItem
							asChild
							onSelect={(event) => event.preventDefault()}
						>
							<QuickCategorizeForm
								categories={categories.filter(
									(category) => category.kind === row.movementType,
								)}
								currentCategoryId={row.categoryId}
								transactionDescription={row.description}
								transactionId={row.id}
							/>
						</DropdownMenuItem>
					) : null}
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild variant="destructive">
						<form action={archiveAction} className="w-full">
							<input name="id" type="hidden" value={row.id} />
							<button className="w-full text-left" type="submit">
								Arquivar
							</button>
						</form>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<EditTransactionDialog
				accounts={accounts}
				archiveAction={archiveAction}
				categories={categories}
				row={row}
				updateAction={updateAction}
			/>
		</Dialog>
	);
}

function EditTransactionDialog({
	row,
	accounts,
	categories,
	updateAction,
	archiveAction,
}: RowActionProps) {
	return (
		<DialogContent className="max-w-3xl">
			<DialogHeader>
				<DialogTitle>Editar transação</DialogTitle>
			</DialogHeader>
			<form action={updateAction} className="grid gap-4">
				<input name="id" type="hidden" value={row.id} />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<Field defaultValue={row.occurredOn} name="occurredOn" type="date" />
					<Field defaultValue={row.description} name="description" />
					<Field
						defaultValue={row.originalDescription ?? ""}
						name="originalDescription"
						placeholder="Descrição original"
					/>
					<Field
						defaultValue={formatMoneyInput(row.amountCents)}
						name="amount"
					/>
					<SelectField
						defaultValue={row.accountId}
						name="accountId"
						options={accounts}
					/>
					<SelectField
						defaultValue={row.destinationAccountId ?? ""}
						emptyLabel="Conta destino"
						name="destinationAccountId"
						options={accounts}
					/>
					<SelectField
						defaultValue={row.categoryId ?? ""}
						emptyLabel="Categoria"
						name="categoryId"
						options={categories}
					/>
					<SelectRecord
						defaultValue={row.movementType}
						name="movementType"
						options={movementLabels}
					/>
					<SelectRecord
						defaultValue={row.status}
						name="status"
						options={statusLabels}
					/>
					<Field
						defaultValue={row.notes ?? ""}
						name="notes"
						placeholder="Notas"
					/>
				</div>
				<DialogFooter>
					<SubmitButton pendingLabel="Salvando...">
						Salvar transação
					</SubmitButton>
					<SubmitButton
						formAction={archiveAction}
						pendingLabel="Arquivando..."
						variant="destructive"
					>
						Arquivar
					</SubmitButton>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}

export function QuickCategorizeForm({
	categories,
	currentCategoryId,
	transactionDescription,
	transactionId,
}: {
	categories: SelectOption[];
	currentCategoryId: number | null;
	transactionDescription: string;
	transactionId: number;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const hintId = `quick-categorize-hint-${transactionId}`;

	if (categories.length === 0) {
		return (
			<p className="px-2 py-1.5 text-muted-foreground text-sm">
				Crie uma categoria compatível antes de categorizar rapidamente.
			</p>
		);
	}

	return (
		<form
			action={quickCategorizeTransaction}
			aria-describedby={hintId}
			className="grid gap-2 p-2"
			onKeyDown={(event) => {
				if (event.ctrlKey && event.key === "Enter") {
					event.preventDefault();
					formRef.current?.requestSubmit();
				}
			}}
			ref={formRef}
		>
			<input name="id" type="hidden" value={transactionId} />
			<label className="sr-only" htmlFor={`quick-category-${transactionId}`}>
				Categoria rápida para {transactionDescription}
			</label>
			<select
				className={selectClass}
				defaultValue={currentCategoryId ?? categories[0]?.id}
				id={`quick-category-${transactionId}`}
				name="categoryId"
			>
				{categories.map((category) => (
					<option key={category.id} value={category.id}>
						{category.name}
					</option>
				))}
			</select>
			<SubmitButton
				aria-keyshortcuts="Control+Enter"
				pendingLabel="Categorizando..."
				size="sm"
				title="Atalho neste controle: Ctrl+Enter"
				variant="secondary"
			>
				Categorizar
			</SubmitButton>
			<span className="text-muted-foreground text-xs" id={hintId}>
				Atalho com foco neste controle: Ctrl+Enter.
			</span>
		</form>
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

function Field(props: React.ComponentProps<typeof Input> & { name: string }) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`transaction-${props.name}`}>
				{props.placeholder ?? props.name}
			</Label>
			<Input id={`transaction-${props.name}`} {...props} />
		</div>
	);
}

function SelectField({
	name,
	options,
	emptyLabel,
	defaultValue,
}: {
	name: string;
	options: SelectOption[];
	emptyLabel?: string;
	defaultValue?: string | number;
}) {
	return (
		<select className={selectClass} defaultValue={defaultValue} name={name}>
			{emptyLabel ? <option value="">{emptyLabel}</option> : null}
			{options.map((option) => (
				<option key={option.id} value={option.id}>
					{option.name}
				</option>
			))}
		</select>
	);
}

function SelectRecord({
	name,
	options,
	defaultValue,
}: {
	name: string;
	options: Record<string, string>;
	defaultValue?: string;
}) {
	return (
		<select className={selectClass} defaultValue={defaultValue} name={name}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
