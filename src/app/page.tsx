import { asc, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	archiveAccount,
	archiveCategory,
	archiveCategoryGroup,
	archiveTransaction,
	createAccount,
	createCategory,
	createCategoryGroup,
	createDefaultCategories,
	createTransaction,
	updateAccount,
	updateCategory,
	updateCategoryGroup,
	updateTransaction,
} from "~/app/_actions/finance-actions";
import { SignInForm } from "~/app/_components/sign-in-form";
import {
	calculateAccountBalances,
	getCurrentMonthPeriod,
	getInvoiceForDate,
} from "~/lib/finance-rules";
import { auth } from "~/server/better-auth";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	transactions,
} from "~/server/db/schema";

const accountTypeLabels = {
	checking: "Conta corrente",
	savings: "Poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

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

type HomeProps = {
	searchParams?: Promise<{
		start?: string;
		end?: string;
		accountId?: string;
		categoryId?: string;
		movementType?: string;
		q?: string;
		sort?: string;
	}>;
};

export default async function Home({ searchParams }: HomeProps) {
	const session = await getSession();

	return (
		<main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
				<header className="flex flex-col gap-4 border-slate-800 border-b pb-8 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="font-medium text-emerald-300 text-sm uppercase tracking-[0.3em]">
							Finanças pessoais
						</p>
						<h1 className="mt-3 font-semibold text-4xl tracking-tight">
							Finance App
						</h1>
						<p className="mt-3 max-w-2xl text-slate-300">
							Controle contas, categorias, transações e faturas dinâmicas em
							BRL.
						</p>
					</div>

					{session && (
						<div className="flex gap-3">
							<Link
								className="rounded-full border border-slate-700 px-5 py-2 font-medium text-sm transition hover:border-slate-500 hover:bg-slate-900"
								href="/import"
							>
								Importar CSV
							</Link>
							<form>
								<button
									className="rounded-full border border-slate-700 px-5 py-2 font-medium text-sm transition hover:border-slate-500 hover:bg-slate-900"
									formAction={async () => {
										"use server";
										await auth.api.signOut({ headers: await headers() });
										redirect("/");
									}}
									type="submit"
								>
									Sair
								</button>
							</form>
						</div>
					)}
				</header>

				{session ? (
					<Dashboard
						searchParams={searchParams}
						userId={session.user.id}
						userName={session.user.name}
					/>
				) : (
					<PublicHome />
				)}
			</div>
		</main>
	);
}

async function Dashboard({
	userId,
	userName,
	searchParams,
}: {
	userId: string;
	userName: string;
	searchParams: HomeProps["searchParams"];
}) {
	const period = getCurrentMonthPeriod();
	const filters = {
		start: period.start,
		end: period.end,
		...(await searchParams),
	};

	const [allAccounts, allGroups, allCategories, allTransactions] =
		await Promise.all([
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, userId))
				.orderBy(asc(financialAccounts.name)),
			db
				.select()
				.from(categoryGroups)
				.where(eq(categoryGroups.userId, userId))
				.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, userId))
				.orderBy(asc(categories.kind), asc(categories.name)),
			db
				.select()
				.from(transactions)
				.where(eq(transactions.userId, userId))
				.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		]);

	const activeAccounts = allAccounts.filter((account) => !account.isArchived);
	const usableAccounts = activeAccounts.filter((account) => account.isActive);
	const activeGroups = allGroups.filter((group) => !group.isArchived);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const categoryById = new Map(
		allCategories.map((category) => [category.id, category]),
	);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const normalConsolidated = activeAccounts.reduce(
		(total, account) =>
			total + (balances.get(account.id)?.normalBalanceCents ?? 0),
		0,
	);
	const cardDebt = activeAccounts.reduce(
		(total, account) => total + (balances.get(account.id)?.cardDebtCents ?? 0),
		0,
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

	const categoryTotals = new Map<number, number>();
	const groupTotals = new Map<number, number>();
	for (const transaction of visibleTransactions) {
		if (
			transaction.status === "confirmed" &&
			transaction.movementType === "expense" &&
			transaction.categoryId
		) {
			const category = categoryById.get(transaction.categoryId);
			categoryTotals.set(
				transaction.categoryId,
				(categoryTotals.get(transaction.categoryId) ?? 0) +
					transaction.amountCents,
			);
			if (category) {
				groupTotals.set(
					category.groupId,
					(groupTotals.get(category.groupId) ?? 0) + transaction.amountCents,
				);
			}
		}
	}

	return (
		<div className="grid gap-8">
			<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
				<p className="text-slate-400 text-sm">Sessão ativa</p>
				<h2 className="mt-2 font-semibold text-2xl">Olá, {userName}</h2>
				<div className="mt-6 grid gap-4 md:grid-cols-3">
					<SummaryCard
						label="Saldo consolidado sem cartões"
						value={formatMoney(normalConsolidated)}
					/>
					<SummaryCard
						label="Dívida aberta em cartões"
						value={formatMoney(cardDebt)}
					/>
					<SummaryCard
						label="Período padrão"
						value={`${formatDate(filters.start)} – ${formatDate(filters.end)}`}
					/>
				</div>
			</section>

			<section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<Panel title="Contas">
					<form
						action={createAccount}
						className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-3"
					>
						<TextInput name="name" placeholder="Nome" />
						<TextInput name="institution" placeholder="Instituição" />
						<Select name="type" options={accountTypeLabels} />
						<TextInput
							defaultValue="0,00"
							name="initialBalance"
							placeholder="Saldo inicial"
						/>
						<TextInput name="closingDay" placeholder="Fechamento (cartão)" />
						<TextInput name="dueDay" placeholder="Vencimento (cartão)" />
						<SubmitButton>Cadastrar conta</SubmitButton>
					</form>
					<div className="mt-4 grid gap-3">
						{activeAccounts.map((account) => (
							<form
								action={updateAccount}
								className="grid gap-2 rounded-2xl border border-slate-800 p-4 md:grid-cols-6"
								key={account.id}
							>
								<input name="id" type="hidden" value={account.id} />
								<TextInput defaultValue={account.name} name="name" />
								<TextInput
									defaultValue={account.institution ?? ""}
									name="institution"
								/>
								<Select
									defaultValue={account.type}
									name="type"
									options={accountTypeLabels}
								/>
								<TextInput
									defaultValue={formatMoneyInput(account.initialBalanceCents)}
									name="initialBalance"
								/>
								<TextInput
									defaultValue={account.creditCardClosingDay?.toString() ?? ""}
									name="closingDay"
									placeholder="Fecha"
								/>
								<TextInput
									defaultValue={account.creditCardDueDay?.toString() ?? ""}
									name="dueDay"
									placeholder="Vence"
								/>
								<label className="flex items-center gap-2 text-sm">
									<input
										defaultChecked={account.isActive}
										name="isActive"
										type="checkbox"
									/>{" "}
									Ativa
								</label>
								<p className="text-slate-300 text-sm md:col-span-2">
									Saldo:{" "}
									{formatMoney(
										balances.get(account.id)?.normalBalanceCents ?? 0,
									)}{" "}
									· Cartão:{" "}
									{formatMoney(balances.get(account.id)?.cardDebtCents ?? 0)}
								</p>
								<SubmitButton>Salvar</SubmitButton>
								<button
									className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200 text-sm"
									formAction={archiveAccount}
									type="submit"
								>
									Arquivar
								</button>
							</form>
						))}
					</div>
				</Panel>

				<Panel title="Categorias">
					<form action={createDefaultCategories} className="mb-4">
						<SubmitButton>Criar categorias iniciais</SubmitButton>
					</form>
					<form
						action={createCategoryGroup}
						className="grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-3"
					>
						<TextInput name="name" placeholder="Grupo" />
						<Select
							name="kind"
							options={{ income: "Receita", expense: "Despesa" }}
						/>
						<SubmitButton>Cadastrar grupo</SubmitButton>
					</form>
					<form
						action={createCategory}
						className="mt-3 grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-3"
					>
						<TextInput name="name" placeholder="Categoria" />
						<select className={inputClass} name="groupId">
							{activeGroups.map((group) => (
								<option key={group.id} value={group.id}>
									{group.name} (
									{group.kind === "income" ? "receita" : "despesa"})
								</option>
							))}
						</select>
						<SubmitButton>Cadastrar categoria</SubmitButton>
					</form>

					<div className="mt-4 grid gap-2">
						{activeGroups.map((group) => (
							<form
								action={updateCategoryGroup}
								className="grid gap-2 rounded-xl border border-slate-800 p-3 md:grid-cols-[1fr_110px_120px_90px]"
								key={group.id}
							>
								<input name="id" type="hidden" value={group.id} />
								<TextInput defaultValue={group.name} name="name" />
								<p className="text-slate-400 text-sm">
									{group.kind === "income" ? "Receita" : "Despesa"}
									<br />
									{formatMoney(groupTotals.get(group.id) ?? 0)}
								</p>
								<SubmitButton>Salvar</SubmitButton>
								<button
									className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200 text-sm"
									formAction={archiveCategoryGroup}
									type="submit"
								>
									Arquivar
								</button>
							</form>
						))}
					</div>

					<div className="mt-4 grid gap-2">
						{activeCategories.map((category) => (
							<form
								action={updateCategory}
								className="grid gap-2 rounded-xl border border-slate-800 p-3 md:grid-cols-[1fr_1fr_120px_90px]"
								key={category.id}
							>
								<input name="id" type="hidden" value={category.id} />
								<TextInput defaultValue={category.name} name="name" />
								<select
									className={inputClass}
									defaultValue={category.groupId}
									name="groupId"
								>
									{activeGroups
										.filter((group) => group.kind === category.kind)
										.map((group) => (
											<option key={group.id} value={group.id}>
												{group.name}
											</option>
										))}
								</select>
								<p className="text-slate-400 text-sm">
									{category.kind === "income" ? "Receita" : "Despesa"}
									<br />
									{categoryTotals.has(category.id)
										? formatMoney(categoryTotals.get(category.id) ?? 0)
										: "sem gasto"}
								</p>
								<SubmitButton>Salvar</SubmitButton>
								<button
									className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200 text-sm md:col-start-4"
									formAction={archiveCategory}
									type="submit"
								>
									Arquivar
								</button>
							</form>
						))}
					</div>
				</Panel>
			</section>

			<Panel title="Transações">
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

				<form className="mt-5 grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-7">
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

				<div className="mt-4 overflow-hidden rounded-2xl border border-slate-800">
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
					{visibleTransactions.length === 0 && (
						<p className="p-6 text-slate-400">
							Nenhuma transação no filtro atual.
						</p>
					)}
				</div>
			</Panel>

			<Panel title="Faturas dinâmicas de cartão">
				<div className="grid gap-4 md:grid-cols-2">
					{activeAccounts
						.filter((account) => account.type === "credit_card")
						.map((card) => {
							const invoices = new Map<
								string,
								{ closingDate: string; dueDate: string; total: number }
							>();
							for (const transaction of allTransactions) {
								if (
									!transaction.isArchived &&
									transaction.status === "confirmed" &&
									transaction.accountId === card.id &&
									transaction.movementType === "expense"
								) {
									const invoice = getInvoiceForDate(
										transaction.occurredOn,
										card.creditCardClosingDay ?? 31,
										card.creditCardDueDay ?? 10,
									);
									const saved = invoices.get(invoice.key) ?? {
										...invoice,
										total: 0,
									};
									saved.total += transaction.amountCents;
									invoices.set(invoice.key, saved);
								}
							}
							return (
								<div
									className="rounded-2xl border border-slate-800 p-4"
									key={card.id}
								>
									<h3 className="font-medium">{card.name}</h3>
									<p className="text-slate-400 text-sm">
										Dívida aberta:{" "}
										{formatMoney(balances.get(card.id)?.cardDebtCents ?? 0)}
									</p>
									{Array.from(invoices.entries()).map(([key, invoice]) => (
										<p className="mt-2 text-sm" key={key}>
											{key}: {formatMoney(invoice.total)} · fecha{" "}
											{formatDate(invoice.closingDate)} · vence{" "}
											{formatDate(invoice.dueDate)}
										</p>
									))}
								</div>
							);
						})}
				</div>
			</Panel>
		</div>
	);
}

function PublicHome() {
	return (
		<section className="grid gap-8 md:grid-cols-[1fr_420px] md:items-start">
			<div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
				<h2 className="font-semibold text-2xl">
					Base simples para controle financeiro
				</h2>
				<p className="mt-4 text-slate-300">
					Entre com email e senha para acessar seu painel financeiro isolado por
					usuário.
				</p>
				<div className="mt-6 grid gap-3 text-slate-300 text-sm">
					<p>• Compras no cartão são despesas.</p>
					<p>• Pagamento de fatura é transferência para o cartão.</p>
					<p>• Transações arquivadas não entram nos saldos padrão.</p>
				</div>
			</div>
			<SignInForm />
		</section>
	);
}

function Panel({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
			<h2 className="mb-4 font-semibold text-xl">{title}</h2>
			{children}
		</section>
	);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
			<p className="text-slate-400 text-sm">{label}</p>
			<p className="mt-2 font-semibold text-2xl">{value}</p>
		</div>
	);
}

const inputClass =
	"rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input className={inputClass} {...props} />;
}

function Select({
	options,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
	options: Record<string, string>;
}) {
	return (
		<select className={inputClass} {...props}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

function SubmitButton({ children }: { children: React.ReactNode }) {
	return (
		<button
			className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-slate-950 text-sm"
			type="submit"
		>
			{children}
		</button>
	);
}

function formatMoney(cents: number) {
	return new Intl.NumberFormat("pt-BR", {
		currency: "BRL",
		style: "currency",
	}).format(cents / 100);
}

function formatMoneyInput(cents: number) {
	return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
		new Date(`${value}T00:00:00Z`),
	);
}
