import { asc, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import { CategoriesClient } from "~/app/categories/categories-client";
import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { getCurrentMonthPeriod } from "~/lib/finance-rules";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { categories, categoryGroups, transactions } from "~/server/db/schema";
import { userTag } from "~/server/invalidate";

export default async function CategoriesPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const period = getCurrentMonthPeriod();
	const { allGroups, allCategories, allTransactions } = await loadCategoriesData(session.user.id);
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
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Organize receitas e despesas em grupos e categorias. Arquivar preserva histórico."
				eyebrow="Categorias"
				title="Grupos e categorias"
			/>
			<CategoriesClient
				activeCategories={activeCategories}
				activeGroups={activeGroups}
				categoryTotals={Object.fromEntries(categoryTotals)}
				groupTotals={Object.fromEntries(groupTotals)}
			/>
		</AppShell>
	);
}

function loadCategoriesData(userId: string) {
	return unstable_cache(
		async () => {
			const [allGroups, allCategories, allTransactions] = await Promise.all([
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
			return { allGroups, allCategories, allTransactions };
		},
		[`categories-data:${userId}`],
		{
			tags: [userTag(userId, "categories"), userTag(userId, "transactions")],
			revalidate: 3600,
		},
	)();
}
