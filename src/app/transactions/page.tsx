import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
	archiveTransaction,
	createTransaction,
	updateTransaction,
} from "~/app/_actions/finance-actions";
import {
	FinanceShell,
	inputClass,
	Panel,
	Select,
	SubmitButton,
	TextInput,
} from "~/app/_components/finance-ui";
import { getCurrentMonthPeriod } from "~/lib/finance-rules";
import { formatDate, formatMoney, formatMoneyInput } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	financialAccounts,
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
		start: period.start,
		...(await searchParams),
	};
	const [allAccounts, allCategories, allTransactions] = await Promise.all([
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

	return (
		<FinanceShell
			description="Cadastre, edite e filtre transações manuais ou importadas."
			eyebrow="Transações"
			title="Transações"
		>
			<Panel title="Nova transação">
				<form
					action={createTransaction}
					className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-4"
				>
					<TextInput
						defaultValue={period.start}
						name="occurredOn"
						type="date"
					/>
					<TextInput name="description" placeholder="Descrição" />
					<TextInput
						name="originalDescription"
						placeholder="Descrição original"
					/>
					<TextInput name="amount" placeholder="Valor" />
					<select className={inputClass} name="accountId">
						{usableAccounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
					<select className={inputClass} name="destinationAccountId">
						<option value="">Conta destino</option>
						{usableAccounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
					<select className={inputClass} name="categoryId">
						<option value="">Categoria</option>
						{activeCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					<Select name="movementType" options={movementLabels} />
					<Select
						defaultValue="confirmed"
						name="status"
						options={statusLabels}
					/>
					<TextInput name="notes" placeholder="Notas" />
					<SubmitButton>Lançar transação</SubmitButton>
				</form>
			</Panel>

			<Panel title="Filtros">
				<form className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-7">
					<TextInput defaultValue={filters.start} name="start" type="date" />
					<TextInput defaultValue={filters.end} name="end" type="date" />
					<select
						className={inputClass}
						defaultValue={filters.accountId}
						name="accountId"
					>
						<option value="">Conta</option>
						{activeAccounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
					<select
						className={inputClass}
						defaultValue={filters.categoryId}
						name="categoryId"
					>
						<option value="">Categoria</option>
						{activeCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					<select
						className={inputClass}
						defaultValue={filters.movementType}
						name="movementType"
					>
						<option value="">Tipo</option>
						{Object.entries(movementLabels).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<TextInput
						defaultValue={filters.q ?? ""}
						name="q"
						placeholder="Texto"
					/>
					<select
						className={inputClass}
						defaultValue={filters.sort}
						name="sort"
					>
						<option value="date">Data</option>
						<option value="value">Valor</option>
						<option value="category">Categoria</option>
					</select>
					<SubmitButton>Filtrar</SubmitButton>
				</form>
			</Panel>

			<Panel title="Lista de transações">
				<div className="overflow-hidden rounded-2xl border border-slate-800">
					{visibleTransactions.map((transaction) => (
						<details
							className="border-slate-800 border-b p-4 text-sm"
							key={transaction.id}
						>
							<summary className="grid cursor-pointer gap-2 md:grid-cols-[110px_1fr_160px_160px_120px]">
								<span>{formatDate(transaction.occurredOn)}</span>
								<span>
									{transaction.description}
									<small className="block text-slate-400">
										{transaction.originalDescription}
									</small>
								</span>
								<span>{accountById.get(transaction.accountId)?.name}</span>
								<span>
									{categoryById.get(transaction.categoryId ?? 0)?.name ?? "—"}
								</span>
								<span>{formatMoney(transaction.amountCents)}</span>
							</summary>
							<form
								action={updateTransaction}
								className="mt-4 grid gap-3 rounded-xl border border-slate-800 p-4 md:grid-cols-4"
							>
								<input name="id" type="hidden" value={transaction.id} />
								<TextInput
									defaultValue={transaction.occurredOn}
									name="occurredOn"
									type="date"
								/>
								<TextInput
									defaultValue={transaction.description}
									name="description"
								/>
								<TextInput
									defaultValue={transaction.originalDescription ?? ""}
									name="originalDescription"
									placeholder="Descrição original"
								/>
								<TextInput
									defaultValue={formatMoneyInput(transaction.amountCents)}
									name="amount"
								/>
								<select
									className={inputClass}
									defaultValue={transaction.accountId}
									name="accountId"
								>
									{allAccounts.map((account) => (
										<option key={account.id} value={account.id}>
											{account.name}
										</option>
									))}
								</select>
								<select
									className={inputClass}
									defaultValue={transaction.destinationAccountId ?? ""}
									name="destinationAccountId"
								>
									<option value="">Conta destino</option>
									{allAccounts.map((account) => (
										<option key={account.id} value={account.id}>
											{account.name}
										</option>
									))}
								</select>
								<select
									className={inputClass}
									defaultValue={transaction.categoryId ?? ""}
									name="categoryId"
								>
									<option value="">Categoria</option>
									{allCategories.map((category) => (
										<option key={category.id} value={category.id}>
											{category.name}
										</option>
									))}
								</select>
								<Select
									defaultValue={transaction.movementType}
									name="movementType"
									options={movementLabels}
								/>
								<Select
									defaultValue={transaction.status}
									name="status"
									options={statusLabels}
								/>
								<TextInput
									defaultValue={transaction.notes ?? ""}
									name="notes"
									placeholder="Notas"
								/>
								<SubmitButton>Salvar transação</SubmitButton>
								<button
									className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200 text-sm"
									formAction={archiveTransaction}
									type="submit"
								>
									Arquivar
								</button>
							</form>
						</details>
					))}
					{visibleTransactions.length === 0 ? (
						<p className="p-6 text-slate-400">
							Nenhuma transação no filtro atual.
						</p>
					) : null}
				</div>
			</Panel>
		</FinanceShell>
	);
}
