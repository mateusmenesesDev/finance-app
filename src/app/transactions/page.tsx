import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	archiveTransaction,
	bulkUpdateTransactions,
	createTransaction,
	deleteTransactionFilter,
	saveTransactionFilter,
	updateTransaction,
} from "~/app/_actions/finance-actions";
import { TransactionsTable } from "~/app/transactions/transactions-table";
import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { SubmitButton } from "~/components/submit-button";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getCurrentMonthPeriod } from "~/lib/finance-rules";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	financialAccounts,
	transactionSavedFilters,
	transactions,
} from "~/server/db/schema";

const movementLabels = {
	income: "Receita",
	expense: "Despesa",
	transfer: "Transferência",
	credit_card_payment: "Pagamento de fatura",
	balance_adjustment: "Ajuste de saldo",
};

const statusLabels = {
	planned: "Prevista",
	confirmed: "Confirmada",
	ignored: "Ignorada",
	duplicate: "Duplicada",
	pending_review: "Pendente de revisão",
};

type TransactionsPageProps = {
	searchParams?: Promise<{
		accountId?: string;
		categoryId?: string;
		end?: string;
		movementType?: string;
		q?: string;
		sort?: string;
		start?: string;
	}>;
};

export default async function TransactionsPage({
	searchParams,
}: TransactionsPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const period = getCurrentMonthPeriod();
	const filters = {
		end: period.end,
		sort: "date",
		start: period.start,
		...(await searchParams),
	};
	const [allAccounts, allCategories, allTransactions, savedFilters] =
		await Promise.all([
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, session.user.id))
				.orderBy(asc(financialAccounts.name)),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, session.user.id))
				.orderBy(asc(categories.kind), asc(categories.name)),
			db
				.select()
				.from(transactions)
				.where(eq(transactions.userId, session.user.id))
				.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
			db
				.select()
				.from(transactionSavedFilters)
				.where(eq(transactionSavedFilters.userId, session.user.id))
				.orderBy(asc(transactionSavedFilters.name)),
		]);
	const activeAccounts = allAccounts.filter((account) => !account.isArchived);
	const usableAccounts = activeAccounts.filter((account) => account.isActive);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const categoryById = new Map(
		allCategories.map((category) => [category.id, category]),
	);
	const visibleTransactions = allTransactions
		.filter((transaction) => !transaction.isArchived)
		.filter(
			(transaction) =>
				transaction.occurredOn >= filters.start &&
				transaction.occurredOn <= filters.end,
		)
		.filter(
			(transaction) =>
				!filters.accountId ||
				transaction.accountId === Number(filters.accountId),
		)
		.filter(
			(transaction) =>
				!filters.categoryId ||
				transaction.categoryId === Number(filters.categoryId),
		)
		.filter(
			(transaction) =>
				!filters.movementType ||
				transaction.movementType === filters.movementType,
		)
		.filter((transaction) => {
			if (!filters.q) return true;
			const haystack =
				`${transaction.description} ${transaction.originalDescription ?? ""}`.toLowerCase();
			return haystack.includes(filters.q.toLowerCase());
		})
		.sort((left, right) => {
			if (filters.sort === "value") return right.amountCents - left.amountCents;
			if (filters.sort === "category") {
				return (
					categoryById.get(left.categoryId ?? 0)?.name ?? ""
				).localeCompare(categoryById.get(right.categoryId ?? 0)?.name ?? "");
			}
			return right.occurredOn.localeCompare(left.occurredOn);
		});

	const investmentAccounts = activeAccounts.filter(
		(account) => account.type === "investment",
	);
	const investmentReviewCandidates = findInvestmentReviewCandidates(
		allTransactions,
	).slice(0, 8);
	const accountOptions = allAccounts.map(({ id, name }) => ({ id, name }));
	const categoryOptions = allCategories.map(({ id, name, kind }) => ({
		id,
		kind,
		name,
	}));

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Cadastre, edite e filtre transações manuais ou importadas."
				eyebrow="Transações"
				title="Transações"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Nova transação</CardTitle>
					<CardDescription>
						Use quando precisar lançar algo manualmente. A lista e a revisão
						ficam em destaque abaixo.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<details>
						<summary className="cursor-pointer rounded-md border px-4 py-3 font-medium text-sm hover:bg-muted/50">
							Abrir formulário de lançamento
						</summary>
						<form
							action={createTransaction}
							className="mt-4 grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						>
							<Input
								defaultValue={period.start}
								name="occurredOn"
								type="date"
							/>
							<Input name="description" placeholder="Descrição" />
							<Input
								name="originalDescription"
								placeholder="Descrição original"
							/>
							<Input name="amount" placeholder="Valor" />
							<select className={selectClass} name="accountId">
								{usableAccounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.name}
									</option>
								))}
							</select>
							<select className={selectClass} name="destinationAccountId">
								<option value="">Conta destino</option>
								{usableAccounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.name}
									</option>
								))}
							</select>
							<select className={selectClass} name="categoryId">
								<option value="">Categoria</option>
								{activeCategories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))}
							</select>
							<SelectRecord name="movementType" options={movementLabels} />
							<SelectRecord
								defaultValue="confirmed"
								name="status"
								options={statusLabels}
							/>
							<Input name="notes" placeholder="Notas" />
							<SubmitButton pendingLabel="Lançando...">
								Lançar transação
							</SubmitButton>
						</form>
					</details>
				</CardContent>
			</Card>

			{investmentAccounts.length > 0 &&
			investmentReviewCandidates.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Revisão assistida de caixinhas</CardTitle>
						<CardDescription>
							Possíveis aportes/resgates lançados como receita ou despesa.
							Revise e converta para transferência quando for só mudança entre
							Nubank e caixinha.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2">
						{investmentReviewCandidates.map((transaction) => (
							<Link
								className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm transition hover:border-primary/50 hover:bg-muted/30"
								href={`/transactions?start=${transaction.occurredOn}&end=${transaction.occurredOn}&q=${encodeURIComponent(transaction.description)}`}
								key={transaction.id}
							>
								<span className="min-w-0 truncate">
									{transaction.occurredOn} · {transaction.description}
								</span>
								<span className="shrink-0">
									{movementLabels[transaction.movementType]}
								</span>
							</Link>
						))}
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Lista de transações</CardTitle>
					<CardDescription>
						Selecione linhas visíveis e aplique mudanças seguras. Limite: 100
						transações por envio.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<FilterBar
						activeAccounts={activeAccounts}
						activeCategories={activeCategories}
						filters={filters}
						savedFilters={savedFilters}
					/>
					<BulkEditPanel
						activeCategories={activeCategories}
						usableAccounts={usableAccounts}
					/>
					<TransactionsTable
						accounts={accountOptions}
						archiveAction={archiveTransaction}
						categories={categoryOptions}
						rows={visibleTransactions.map((transaction) => ({
							id: transaction.id,
							accountId: transaction.accountId,
							accountName: transaction.accountId
								? (accountById.get(transaction.accountId)?.name ?? "—")
								: "Cartão",
							amountCents: transaction.amountCents,
							categoryId: transaction.categoryId,
							categoryName:
								categoryById.get(transaction.categoryId ?? 0)?.name ?? null,
							description: transaction.description,
							destinationAccountId: transaction.destinationAccountId,
							movementType: transaction.movementType,
							notes: transaction.notes,
							occurredOn: transaction.occurredOn,
							originalDescription: transaction.originalDescription,
							status: transaction.status,
						}))}
						updateAction={updateTransaction}
					/>
				</CardContent>
			</Card>
		</AppShell>
	);
}

function FilterBar({
	activeAccounts,
	activeCategories,
	filters,
	savedFilters,
}: {
	activeAccounts: Array<{ id: number; name: string }>;
	activeCategories: Array<{ id: number; name: string }>;
	filters: Record<string, string | undefined>;
	savedFilters: Array<{
		id: number;
		name: string;
		accountId: number | null;
		categoryId: number | null;
		end: string;
		movementType: string | null;
		query: string | null;
		sort: string;
		start: string;
	}>;
}) {
	return (
		<div className="rounded-lg border bg-muted/20 p-4">
			<form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_160px_1fr_auto]">
				<Input defaultValue={filters.start} name="start" type="date" />
				<Input defaultValue={filters.end} name="end" type="date" />
				<Input
					defaultValue={filters.q ?? ""}
					name="q"
					placeholder="Buscar por descrição"
				/>
				<SubmitButton pendingLabel="Filtrando...">Filtrar</SubmitButton>
				<div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
					<SelectOptions
						defaultValue={filters.accountId}
						emptyLabel="Conta"
						name="accountId"
						options={activeAccounts}
					/>
					<SelectOptions
						defaultValue={filters.categoryId}
						emptyLabel="Categoria"
						name="categoryId"
						options={activeCategories}
					/>
					<SelectRecord
						defaultValue={filters.movementType}
						emptyLabel="Tipo"
						name="movementType"
						options={movementLabels}
					/>
					<select
						className={selectClass}
						defaultValue={filters.sort}
						name="sort"
					>
						<option value="date">Data</option>
						<option value="value">Valor</option>
						<option value="category">Categoria</option>
					</select>
				</div>
			</form>
			<details className="mt-4 rounded-md border bg-background p-4">
				<summary className="cursor-pointer font-medium text-sm">
					Filtros salvos
				</summary>
				<div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
					<form
						action={saveTransactionFilter}
						className="grid gap-3 md:grid-cols-2"
					>
						{[
							"start",
							"end",
							"accountId",
							"categoryId",
							"movementType",
							"q",
							"sort",
						].map((name) => (
							<input
								key={name}
								name={name}
								type="hidden"
								value={filters[name] ?? (name === "sort" ? "date" : "")}
							/>
						))}
						<Input name="name" placeholder="Nome do filtro atual" required />
						<SubmitButton pendingLabel="Salvando...">
							Salvar filtro
						</SubmitButton>
					</form>
					<div className="flex flex-wrap gap-2">
						{savedFilters.map((filter) => {
							const href = `/transactions?${new URLSearchParams({
								accountId: filter.accountId?.toString() ?? "",
								categoryId: filter.categoryId?.toString() ?? "",
								end: filter.end,
								movementType: filter.movementType ?? "",
								q: filter.query ?? "",
								sort: filter.sort,
								start: filter.start,
							}).toString()}`;
							return (
								<span
									className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
									key={filter.id}
								>
									<Link className="hover:text-primary" href={href}>
										{filter.name}
									</Link>
									<form action={deleteTransactionFilter}>
										<input name="id" type="hidden" value={filter.id} />
										<Button
											className="h-auto px-1 py-0"
											type="submit"
											variant="ghost"
										>
											×
										</Button>
									</form>
								</span>
							);
						})}
						{savedFilters.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Nenhum filtro salvo.
							</p>
						) : null}
					</div>
				</div>
			</details>
		</div>
	);
}

function BulkEditPanel({
	activeCategories,
	usableAccounts,
}: {
	activeCategories: Array<{ id: number; name: string }>;
	usableAccounts: Array<{ id: number; name: string }>;
}) {
	return (
		<details className="rounded-lg border bg-muted/20 p-4">
			<summary className="cursor-pointer font-medium text-sm">
				Edição em lote
			</summary>
			<form
				action={bulkUpdateTransactions}
				className="mt-4 grid gap-3 rounded-md border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
				id="bulk-edit-transactions"
			>
				<CheckboxLabel name="changeCategory">Categoria</CheckboxLabel>
				<SelectOptions
					emptyLabel="Sem categoria"
					name="bulkCategoryId"
					options={activeCategories}
				/>
				<CheckboxLabel name="changeStatus">Status</CheckboxLabel>
				<SelectRecord name="bulkStatus" options={statusLabels} />
				<CheckboxLabel name="changeAccount">Conta</CheckboxLabel>
				<SelectOptions name="bulkAccountId" options={usableAccounts} />
				<CheckboxLabel name="changeNotes">Notas</CheckboxLabel>
				<Input name="bulkNotes" placeholder="Substituir notas" />
				<CheckboxLabel name="changeArchive">Arquivo</CheckboxLabel>
				<select className={selectClass} name="bulkArchive">
					<option value="false">Restaurar</option>
					<option value="true">Arquivar</option>
				</select>
				<SubmitButton
					className="bg-warning text-background hover:bg-warning/90"
					pendingLabel="Aplicando..."
				>
					Aplicar nas selecionadas
				</SubmitButton>
			</form>
		</details>
	);
}

function CheckboxLabel({
	children,
	name,
}: {
	children: React.ReactNode;
	name: string;
}) {
	return (
		<Label className="flex items-center gap-2 text-muted-foreground text-sm">
			<input className="size-4" name={name} type="checkbox" /> {children}
		</Label>
	);
}

function SelectOptions({
	name,
	options,
	emptyLabel,
	defaultValue,
}: {
	name: string;
	options: Array<{ id: number; name: string }>;
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
	emptyLabel,
}: {
	name: string;
	options: Record<string, string>;
	defaultValue?: string;
	emptyLabel?: string;
}) {
	return (
		<select className={selectClass} defaultValue={defaultValue} name={name}>
			{emptyLabel ? <option value="">{emptyLabel}</option> : null}
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

function findInvestmentReviewCandidates(
	rows: (typeof transactions.$inferSelect)[],
) {
	return rows.filter((transaction) => {
		if (transaction.isArchived || transaction.status !== "confirmed")
			return false;
		if (
			transaction.movementType !== "income" &&
			transaction.movementType !== "expense"
		) {
			return false;
		}
		const text =
			`${transaction.description} ${transaction.originalDescription ?? ""}`
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.toLowerCase();
		return /\b(caixinha|resgate|aplicacao|aplicado|investimento|guardar dinheiro)\b/.test(
			text,
		);
	});
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
