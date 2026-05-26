import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { buildMaterializedBudgetInserts } from "~/lib/budget-templates";
import { db } from "~/server/db";
import {
	monthlyBudgets,
	monthlyBudgetTemplates,
	monthlyBudgetTemplateSkips,
} from "~/server/db/schema";

export async function ensureBudgetTemplatesMaterialized(
	userId: string,
	monthKeys: string[],
) {
	const requestedMonthKeys = [...new Set(monthKeys)].sort();
	if (requestedMonthKeys.length === 0) return;

	const [templates, skips, existingBudgets] = await Promise.all([
		db
			.select()
			.from(monthlyBudgetTemplates)
			.where(eq(monthlyBudgetTemplates.userId, userId)),
		db
			.select()
			.from(monthlyBudgetTemplateSkips)
			.where(
				and(
					eq(monthlyBudgetTemplateSkips.userId, userId),
					inArray(monthlyBudgetTemplateSkips.monthKey, requestedMonthKeys),
				),
			),
		db
			.select({
				monthKey: monthlyBudgets.monthKey,
				scope: monthlyBudgets.scope,
				categoryGroupId: monthlyBudgets.categoryGroupId,
				categoryId: monthlyBudgets.categoryId,
			})
			.from(monthlyBudgets)
			.where(
				and(
					eq(monthlyBudgets.userId, userId),
					inArray(monthlyBudgets.monthKey, requestedMonthKeys),
				),
			),
	]);

	const inserts = buildMaterializedBudgetInserts({
		existingBudgets,
		monthKeys: requestedMonthKeys,
		skips,
		templates,
		userId,
	});
	if (inserts.length === 0) return;

	await db.insert(monthlyBudgets).values(inserts).onConflictDoNothing({
		target: [
			monthlyBudgets.userId,
			monthlyBudgets.monthKey,
			monthlyBudgets.scope,
			monthlyBudgets.categoryGroupId,
			monthlyBudgets.categoryId,
		],
	});
}
