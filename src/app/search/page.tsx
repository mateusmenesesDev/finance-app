import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FinanceShell, Panel, TextInput } from "~/app/_components/finance-ui";
import { formatDate, formatMoney } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importTemplates,
	recurrences,
	transactions,
} from "~/server/db/schema";

type SearchPageProps = {
	searchParams?: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const q = (await searchParams)?.q?.trim() ?? "";
	const [
		transactionRows,
		accountRows,
		categoryRows,
		recurrenceRows,
		batchRows,
		templateRows,
		ruleRows,
	] =
		q.length >= 2
			? await Promise.all([
					db
						.select()
						.from(transactions)
						.where(eq(transactions.userId, session.user.id))
						.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
					db
						.select()
						.from(financialAccounts)
						.where(eq(financialAccounts.userId, session.user.id)),
					db
						.select()
						.from(categories)
						.where(eq(categories.userId, session.user.id)),
					db
						.select()
						.from(recurrences)
						.where(eq(recurrences.userId, session.user.id)),
					db
						.select()
						.from(importBatches)
						.where(eq(importBatches.userId, session.user.id))
						.orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
					db
						.select()
						.from(importTemplates)
						.where(eq(importTemplates.userId, session.user.id)),
					db
						.select()
						.from(importCategoryRules)
						.where(eq(importCategoryRules.userId, session.user.id)),
				])
			: [[], [], [], [], [], [], []];

	const matchedTransactions = transactionRows
		.filter((transaction) => !transaction.isArchived)
		.filter((transaction) =>
			matchesSearch(q, [
				transaction.description,
				transaction.originalDescription,
				transaction.notes,
				transaction.occurredOn,
				formatMoney(transaction.amountCents),
				transaction.externalId,
			]),
		)
		.slice(0, 20);
	const matchedAccounts = accountRows
		.filter((account) => !account.isArchived)
		.filter((account) =>
			matchesSearch(q, [account.name, account.institution, account.type]),
		)
		.slice(0, 20);
	const matchedCategories = categoryRows
		.filter((category) => !category.isArchived)
		.filter((category) => matchesSearch(q, [category.name, category.kind]))
		.slice(0, 20);
	const matchedRecurrences = recurrenceRows
		.filter((recurrence) => !recurrence.isArchived)
		.filter((recurrence) =>
			matchesSearch(q, [
				recurrence.name,
				recurrence.description,
				recurrence.movementType,
				formatMoney(recurrence.amountCents),
				recurrence.startsOn,
			]),
		)
		.slice(0, 20);
	const matchedBatches = batchRows
		.filter((batch) =>
			matchesSearch(q, [
				batch.originalFileName,
				batch.sourceLabel,
				batch.status,
				`#${batch.id}`,
			]),
		)
		.slice(0, 20);
	const matchedTemplates = templateRows
		.filter((template) => !template.isArchived)
		.filter((template) =>
			matchesSearch(q, [template.name, template.sourceLabel]),
		)
		.slice(0, 20);
	const matchedRules = ruleRows
		.filter((rule) => !rule.isArchived)
		.filter((rule) =>
			matchesSearch(q, [
				rule.normalizedDescription,
				rule.movementType,
				rule.textMatchMode,
				rule.amountCents ? formatMoney(rule.amountCents) : null,
			]),
		)
		.slice(0, 20);

	return (
		<FinanceShell
			description="Busca global limitada a entidades financeiras; não pesquisa configuração, ajuda ou navegação."
			eyebrow="Busca"
			title="Buscar"
		>
			<Panel title="Nova busca">
				<search>
					<form className="flex flex-wrap gap-3">
						<label className="sr-only" htmlFor="search-page-query">
							Termo de busca
						</label>
						<TextInput
							defaultValue={q}
							id="search-page-query"
							name="q"
							placeholder="Digite ao menos 2 caracteres"
						/>
						<button
							className="rounded-xl bg-[color:var(--color-accent-strong)] px-4 py-2 font-medium text-[color:var(--color-accent-text)] text-sm"
							type="submit"
						>
							Buscar
						</button>
					</form>
				</search>
			</Panel>

			{q.length < 2 ? (
				<Panel title="Resultados">
					<p className="text-[color:var(--color-text-muted)] text-sm">
						Digite ao menos 2 caracteres.
					</p>
				</Panel>
			) : (
				<div className="grid gap-6 lg:grid-cols-2">
					<ResultPanel count={matchedTransactions.length} title="Transações">
						{matchedTransactions.map((transaction) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href={`/transactions?q=${encodeURIComponent(q)}`}
								key={transaction.id}
							>
								<span className="font-medium">{transaction.description}</span>
								<span className="mt-1 block text-[color:var(--color-text-muted)]">
									{formatDate(transaction.occurredOn)} ·{" "}
									{formatMoney(transaction.amountCents)}
								</span>
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedAccounts.length} title="Contas">
						{matchedAccounts.map((account) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href="/accounts"
								key={account.id}
							>
								{account.name}
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedCategories.length} title="Categorias">
						{matchedCategories.map((category) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href="/categories"
								key={category.id}
							>
								{category.name}
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedRecurrences.length} title="Recorrências">
						{matchedRecurrences.map((recurrence) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href="/recurrences"
								key={recurrence.id}
							>
								{recurrence.name}
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedBatches.length} title="Importações">
						{matchedBatches.map((batch) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href={`/import?batchId=${batch.id}`}
								key={batch.id}
							>
								{batch.originalFileName}
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedTemplates.length} title="Modelos CSV">
						{matchedTemplates.map((template) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href="/import"
								key={template.id}
							>
								{template.name}
							</Link>
						))}
					</ResultPanel>
					<ResultPanel count={matchedRules.length} title="Regras de importação">
						{matchedRules.map((rule) => (
							<Link
								className="block rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm hover:border-[color:var(--color-border)]"
								href="/import"
								key={rule.id}
							>
								{rule.normalizedDescription}
							</Link>
						))}
					</ResultPanel>
				</div>
			)}
		</FinanceShell>
	);
}

function matchesSearch(
	query: string,
	values: Array<string | null | undefined>,
) {
	const normalizedQuery = normalizeSearchText(query);
	return values.some((value) =>
		normalizeSearchText(value ?? "").includes(normalizedQuery),
	);
}

function normalizeSearchText(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function ResultPanel({
	children,
	count,
	title,
}: {
	children: React.ReactNode;
	count: number;
	title: string;
}) {
	return (
		<Panel description={`${count} resultado(s)`} title={title}>
			<div className="grid gap-3">
				{count > 0 ? (
					children
				) : (
					<p className="text-[color:var(--color-text-subtle)] text-sm">
						Nada encontrado.
					</p>
				)}
			</div>
		</Panel>
	);
}
