"use client";

import { useState } from "react";

import { Label } from "~/components/ui/label";
import type { MonthlyBudgetScope } from "~/lib/budget-form";

type BudgetOption = {
	id: number;
	name: string;
};

const scopeLabels: Record<MonthlyBudgetScope, string> = {
	category: "Categoria",
	category_group: "Grupo de categoria",
	month: "Mês geral",
};

export function BudgetFormFields({
	categories,
	defaultCategoryGroupId,
	defaultCategoryId,
	defaultScope,
	groups,
	selectClassName,
}: {
	categories: BudgetOption[];
	defaultCategoryGroupId: number | null;
	defaultCategoryId: number | null;
	defaultScope: MonthlyBudgetScope;
	groups: BudgetOption[];
	selectClassName: string;
}) {
	const [scope, setScope] = useState<MonthlyBudgetScope>(defaultScope);
	const [categoryGroupId, setCategoryGroupId] = useState(
		defaultCategoryGroupId ? String(defaultCategoryGroupId) : "",
	);
	const [categoryId, setCategoryId] = useState(
		defaultCategoryId ? String(defaultCategoryId) : "",
	);
	const usesGroup = scope === "category_group";
	const usesCategory = scope === "category";

	return (
		<>
			<div className="grid gap-2">
				<Label htmlFor="budget-scope">Escopo</Label>
				<select
					className={selectClassName}
					id="budget-scope"
					name="scope"
					onChange={(event) =>
						setScope(event.target.value as MonthlyBudgetScope)
					}
					value={scope}
				>
					{Object.entries(scopeLabels).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="budget-categoryGroupId">Grupo</Label>
				<select
					className={selectClassName}
					disabled={!usesGroup}
					id="budget-categoryGroupId"
					name={usesGroup ? "categoryGroupId" : undefined}
					onChange={(event) => setCategoryGroupId(event.target.value)}
					required={usesGroup}
					value={usesGroup ? categoryGroupId : ""}
				>
					<option value="">Sem grupo</option>
					{groups.map((group) => (
						<option key={group.id} value={group.id}>
							{group.name}
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="budget-categoryId">Categoria</Label>
				<select
					className={selectClassName}
					disabled={!usesCategory}
					id="budget-categoryId"
					name={usesCategory ? "categoryId" : undefined}
					onChange={(event) => setCategoryId(event.target.value)}
					required={usesCategory}
					value={usesCategory ? categoryId : ""}
				>
					<option value="">Sem categoria</option>
					{categories.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
						</option>
					))}
				</select>
			</div>
		</>
	);
}
