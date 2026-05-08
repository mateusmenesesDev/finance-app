import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
	archiveCategory,
	archiveCategoryGroup,
	createCategory,
	createCategoryGroup,
	createDefaultCategories,
	updateCategory,
	updateCategoryGroup,
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
import { formatMoney } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { categories, categoryGroups, transactions } from "~/server/db/schema";

export default async function CategoriesPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const period = getCurrentMonthPeriod();
	const [allGroups, allCategories, allTransactions] = await Promise.all([
		db
			.select()
			.from(categoryGroups)
			.where(eq(categoryGroups.userId, session.user.id))
			.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
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
	const activeGroups = allGroups.filter((group) => !group.isArchived);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
	const categoryById = new Map(
		allCategories.map((category) => [category.id, category]),
	);
	const categoryTotals = new Map<number, number>();
	const groupTotals = new Map<number, number>();

	for (const transaction of allTransactions) {
		if (
			transaction.status === "confirmed" &&
			!transaction.isArchived &&
			transaction.movementType === "expense" &&
			transaction.categoryId &&
			transaction.occurredOn >= period.start &&
			transaction.occurredOn <= period.end
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
		<FinanceShell
			description="Organize receitas e despesas em grupos e categorias. Arquivar preserva histórico."
			eyebrow="Categorias"
			title="Grupos e categorias"
		>
			<Panel title="Criar categorias">
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
								{group.name} ({group.kind === "income" ? "receita" : "despesa"})
							</option>
						))}
					</select>
					<SubmitButton>Cadastrar categoria</SubmitButton>
				</form>
			</Panel>

			<section className="grid gap-6 xl:grid-cols-2">
				<Panel title="Grupos">
					<div className="grid gap-2">
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
				</Panel>

				<Panel title="Categorias">
					<div className="grid gap-2">
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
		</FinanceShell>
	);
}
