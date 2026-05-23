import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SearchTransactionsTable } from "~/app/search/search-results-table";
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
import { formatMoney } from "~/lib/formatters";
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

	const accountById = new Map(
		accountRows.map((account) => [account.id, account]),
	);
	const categoryById = new Map(
		categoryRows.map((category) => [category.id, category]),
	);
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
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Busca global limitada a entidades financeiras; não pesquisa configuração, ajuda ou navegação."
				eyebrow="Busca"
				title="Buscar"
			/>

			<Card>
				<CardHeader>
					<CardTitle>Nova busca</CardTitle>
				</CardHeader>
				<CardContent>
					<search>
						<form className="flex flex-wrap gap-3">
							<label className="sr-only" htmlFor="search-page-query">
								Termo de busca
							</label>
							<Input
								className="max-w-md"
								defaultValue={q}
								id="search-page-query"
								name="q"
								placeholder="Digite ao menos 2 caracteres"
							/>
							<SubmitButton>Buscar</SubmitButton>
						</form>
					</search>
				</CardContent>
			</Card>

			{q.length < 2 ? (
				<Card>
					<CardHeader>
						<CardTitle>Resultados</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Digite ao menos 2 caracteres.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-6 lg:grid-cols-2">
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Transações</CardTitle>
							<CardDescription>
								{matchedTransactions.length} resultado(s)
							</CardDescription>
						</CardHeader>
						<CardContent>
							<SearchTransactionsTable
								rows={matchedTransactions.map((transaction) => ({
									id: transaction.id,
									accountName:
										accountById.get(transaction.accountId)?.name ?? null,
									amountCents: transaction.amountCents,
									categoryName:
										categoryById.get(transaction.categoryId ?? 0)?.name ?? null,
									description: transaction.description,
									movementType: transaction.movementType,
									occurredOn: transaction.occurredOn,
									query: q,
									status: transaction.status,
								}))}
							/>
						</CardContent>
					</Card>
					<ResultPanel count={matchedAccounts.length} title="Contas">
						{matchedAccounts.map((account) => (
							<ResultLink href="/accounts" key={account.id}>
								{account.name}
							</ResultLink>
						))}
					</ResultPanel>
					<ResultPanel count={matchedCategories.length} title="Categorias">
						{matchedCategories.map((category) => (
							<ResultLink href="/categories" key={category.id}>
								{category.name}
							</ResultLink>
						))}
					</ResultPanel>
					<ResultPanel count={matchedRecurrences.length} title="Recorrências">
						{matchedRecurrences.map((recurrence) => (
							<ResultLink href="/recurrences" key={recurrence.id}>
								{recurrence.name}
							</ResultLink>
						))}
					</ResultPanel>
					<ResultPanel count={matchedBatches.length} title="Importações">
						{matchedBatches.map((batch) => (
							<ResultLink href={`/import?batchId=${batch.id}`} key={batch.id}>
								{batch.originalFileName}
							</ResultLink>
						))}
					</ResultPanel>
					<ResultPanel count={matchedTemplates.length} title="Modelos CSV">
						{matchedTemplates.map((template) => (
							<ResultLink href="/import" key={template.id}>
								{template.name}
							</ResultLink>
						))}
					</ResultPanel>
					<ResultPanel count={matchedRules.length} title="Regras de importação">
						{matchedRules.map((rule) => (
							<ResultLink href="/import" key={rule.id}>
								{rule.normalizedDescription}
							</ResultLink>
						))}
					</ResultPanel>
				</div>
			)}
		</AppShell>
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
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{count} resultado(s)</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-3">
					{count > 0 ? (
						children
					) : (
						<p className="text-muted-foreground text-sm">Nada encontrado.</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function ResultLink({
	children,
	href,
}: {
	children: React.ReactNode;
	href: string;
}) {
	return (
		<Button asChild className="justify-start" variant="outline">
			<Link href={href}>{children}</Link>
		</Button>
	);
}
