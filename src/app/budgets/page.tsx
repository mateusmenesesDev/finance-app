import { asc, desc, eq } from "drizzle-orm";
import { AlertTriangle, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	archiveBudgetTemplate,
	copyBudgetMonth,
	createOrUpdateBudget,
	deleteBudget,
	updateBudgetTemplate,
} from "~/app/_actions/finance-actions";
import { BudgetDeleteDialog } from "~/app/budgets/budget-delete-dialog";
import { BudgetFormFields } from "~/app/budgets/budget-form-fields";
import { ActionDialog } from "~/components/action-dialog";
import { AppShell } from "~/components/app-shell";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { EmptyState } from "~/components/empty-state";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
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
import { Progress } from "~/components/ui/progress";
import {
	type BudgetScope,
	buildBudgetHistory,
	buildBudgetUsage,
	getMonthPeriod,
	listMonthOptions,
	parseMonthPeriod,
	summarizeBudgetCoherence,
} from "~/lib/finance-rules";
import {
	formatMoney,
	formatMoneyInput,
	formatMonthLabel,
	formatPercent,
} from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { ensureBudgetTemplatesMaterialized } from "~/server/budget-templates";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	monthlyBudgets,
	monthlyBudgetTemplates,
	transactions,
} from "~/server/db/schema";

type BudgetsPageProps = {
	searchParams?: Promise<{
		historyScope?: string;
		month?: string;
	}>;
};

type BudgetRow = typeof monthlyBudgets.$inferSelect;
type BudgetTemplateRow = typeof monthlyBudgetTemplates.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type GroupRow = typeof categoryGroups.$inferSelect;

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const params = await searchParams;
	const period = params?.month
		? (parseMonthPeriod(params.month) ?? getMonthPeriod())
		: getMonthPeriod();
	const historyMonthKeys = lastMonthKeys(period.key, 6);
	await ensureBudgetTemplatesMaterialized(session.user.id, [
		period.key,
		...historyMonthKeys,
	]);
	const [allBudgets, allBudgetTemplates, allCategories, allGroups, allTransactions] =
		await Promise.all([
			db
				.select()
				.from(monthlyBudgets)
				.where(eq(monthlyBudgets.userId, session.user.id))
				.orderBy(asc(monthlyBudgets.monthKey), asc(monthlyBudgets.scope)),
			db
				.select()
				.from(monthlyBudgetTemplates)
				.where(eq(monthlyBudgetTemplates.userId, session.user.id))
				.orderBy(
					asc(monthlyBudgetTemplates.scope),
					asc(monthlyBudgetTemplates.startsAtMonthKey),
				),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, session.user.id))
				.orderBy(asc(categories.kind), asc(categories.name)),
			db
				.select()
				.from(categoryGroups)
				.where(eq(categoryGroups.userId, session.user.id))
				.orderBy(asc(categoryGroups.kind), asc(categoryGroups.name)),
			db
				.select()
				.from(transactions)
				.where(eq(transactions.userId, session.user.id))
				.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
		]);

	const activeExpenseGroups = allGroups.filter(
		(group) => group.kind === "expense" && !group.isArchived,
	);
	const activeExpenseCategories = allCategories.filter(
		(category) => category.kind === "expense" && !category.isArchived,
	);
	const activeRecurringTemplates = allBudgetTemplates.filter(
		(template) => !template.isArchived,
	);
	const monthBudgets = allBudgets.filter(
		(budget) => budget.monthKey === period.key,
	);
	const monthBudgetById = new Map(monthBudgets.map((budget) => [budget.id, budget]));
	const usageRows = buildBudgetUsage(
		monthBudgets,
		allTransactions,
		allCategories,
		allGroups,
		period,
	);
	const totalSpentCents =
		buildBudgetUsage(
			[
				{
					amountCents: 1,
					categoryGroupId: null,
					categoryId: null,
					id: 0,
					monthKey: period.key,
					scope: "month",
				},
			],
			allTransactions,
			allCategories,
			allGroups,
			period,
		)[0]?.spentCents ?? 0;
	const plannedCents = consolidatedPlanned(monthBudgets);
	const summaryPercent = plannedCents ? totalSpentCents / plannedCents : 0;
	const summaryStatus =
		summaryPercent >= 1 ? "over" : summaryPercent >= 0.8 ? "near" : "ok";
	const coherenceWarnings = summarizeBudgetCoherence(
		monthBudgets,
		allCategories,
	);
	const historySelection = parseHistorySelection(params?.historyScope);
	const historyRows = buildBudgetHistory(
		allBudgets,
		allTransactions,
		allCategories,
		allGroups,
		historyMonthKeys,
		historySelection.scope,
		historySelection.refId,
	);
	const sourceMonths = listMonthOptions(
		monthStartDate(period.key),
		12,
		0,
	).filter((option) => option.key !== period.key);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={
					<div className="flex flex-wrap items-end gap-2">
						<form className="flex items-end gap-2">
							<div className="grid gap-1">
								<Label className="text-xs" htmlFor="budget-month">
									Mês
								</Label>
								<Input
									className="h-9"
									defaultValue={period.key}
									id="budget-month"
									name="month"
									type="month"
								/>
							</div>
							<SubmitButton pendingLabel="Atualizando..." size="sm">
								Atualizar
							</SubmitButton>
						</form>
						<BudgetDialog
							categories={activeExpenseCategories}
							groups={activeExpenseGroups}
							monthKey={period.key}
						/>
					</div>
				}
				description="Planeje limites mensais e acompanhe previsto vs realizado por mês, grupo e categoria."
				eyebrow="Orçamento"
				title={`Orçamento de ${formatMonthLabel(period)}`}
			/>

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={PiggyBank}
					label="Previsto consolidado"
					tone={plannedCents ? "default" : "warning"}
					value={plannedCents ? formatMoney(plannedCents) : "Não configurado"}
				/>
				<StatCard
					label="Realizado"
					tone="destructive"
					value={formatMoney(totalSpentCents)}
				/>
				<StatCard
					label="Consumido"
					tone={statusTone(summaryStatus)}
					value={plannedCents ? formatPercent(summaryPercent) : "—"}
				/>
				<StatCard
					label="Status"
					tone={statusTone(summaryStatus)}
					value={statusLabel(summaryStatus)}
				/>
			</section>
			{plannedCents ? (
				<Progress value={Math.min(100, summaryPercent * 100)} />
			) : null}

			{coherenceWarnings.length > 0 ? (
				<Card className="border-warning/40 bg-warning/5">
					<CardHeader>
						<CardTitle>Avisos de coerência</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="grid gap-2 text-sm text-warning">
							{coherenceWarnings.map((warning) => (
								<li
									className="rounded-md border border-warning/40 bg-background/50 p-3"
									key={warning}
								>
									{warning}
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}

			<BudgetTable
				budgetRowsById={monthBudgetById}
				categories={activeExpenseCategories}
				groups={activeExpenseGroups}
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "month")}
				title="Mês geral"
			/>
			<BudgetTable
				budgetRowsById={monthBudgetById}
				categories={activeExpenseCategories}
				groups={activeExpenseGroups}
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "category_group")}
				title="Por grupo"
			/>
			<BudgetTable
				budgetRowsById={monthBudgetById}
				categories={activeExpenseCategories}
				groups={activeExpenseGroups}
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "category")}
				title="Por categoria"
			/>
			<RecurringBudgetTable
				categories={activeExpenseCategories}
				groups={activeExpenseGroups}
				monthKey={period.key}
				rows={activeRecurringTemplates}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Copiar de outro mês</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						action={copyBudgetMonth}
						className="grid gap-3 md:grid-cols-[1fr_180px]"
					>
						<input name="targetMonthKey" type="hidden" value={period.key} />
						<select className={selectClass} name="sourceMonthKey">
							{sourceMonths.map((option) => (
								<option key={option.key} value={option.key}>
									{formatMonthLabel(option)}
								</option>
							))}
						</select>
						<SubmitButton pendingLabel="Copiando...">
							Copiar orçamento
						</SubmitButton>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Histórico (6 meses)</CardTitle>
					<CardDescription>
						Escolha um escopo para comparar previsto, realizado e variações.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="mb-4 flex flex-wrap gap-2">
						<HistoryLink
							active={historySelection.key === "month"}
							href={`/budgets?month=${period.key}&historyScope=month`}
							label="Mês geral"
						/>
						{activeExpenseGroups.map((group) => (
							<HistoryLink
								active={historySelection.key === `group:${group.id}`}
								href={`/budgets?month=${period.key}&historyScope=group:${group.id}`}
								key={group.id}
								label={group.name}
							/>
						))}
						{activeExpenseCategories.map((category) => (
							<HistoryLink
								active={historySelection.key === `category:${category.id}`}
								href={`/budgets?month=${period.key}&historyScope=category:${category.id}`}
								key={category.id}
								label={category.name}
							/>
						))}
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] text-left text-sm">
							<thead className="text-muted-foreground">
								<tr className="border-b">
									<th className="py-2 pr-4">Mês</th>
									<th className="py-2 pr-4">Previsto</th>
									<th className="py-2 pr-4">Realizado</th>
									<th className="py-2 pr-4">%</th>
									<th className="py-2 pr-4">Δ previsto</th>
									<th className="py-2 pr-4">Δ realizado</th>
								</tr>
							</thead>
							<tbody>
								{historyRows.map((row) => (
									<tr className="border-b" key={row.monthKey}>
										<td className="py-3 pr-4">{row.monthKey}</td>
										<td className="py-3 pr-4">
											{moneyOrDash(row.plannedCents)}
										</td>
										<td className="py-3 pr-4">{moneyOrDash(row.spentCents)}</td>
										<td className="py-3 pr-4">
											{row.percent === null ? "—" : formatPercent(row.percent)}
										</td>
										<td className="py-3 pr-4">
											{moneyOrDash(row.deltaPlannedCents)}
										</td>
										<td className="py-3 pr-4">
											{moneyOrDash(row.deltaSpentCents)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</AppShell>
	);
}

type UsageRow = ReturnType<typeof buildBudgetUsage>[number];

function BudgetTable({
	budgetRowsById,
	monthKey,
	rows,
	title,
	groups,
	categories,
}: {
	budgetRowsById: Map<number, BudgetRow>;
	monthKey: string;
	rows: UsageRow[];
	title: string;
	groups: GroupRow[];
	categories: CategoryRow[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<EmptyState
						description="Nenhum orçamento cadastrado."
						icon={AlertTriangle}
						title="Sem orçamento"
					/>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[820px] text-left text-sm">
							<thead className="text-muted-foreground">
								<tr className="border-b">
									<th className="py-2 pr-4">Nome</th>
									<th className="py-2 pr-4">Previsto</th>
									<th className="py-2 pr-4">Realizado</th>
									<th className="py-2 pr-4">%</th>
									<th className="py-2 pr-4">Status</th>
									<th className="py-2 pr-4">Ações</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => {
									const budget =
										budgetRowsById.get(row.budgetId) ?? rowToBudget(row, monthKey);
									return (
									<tr className="border-b" key={row.budgetId}>
										<td className="py-3 pr-4">{row.name}</td>
										<td className="py-3 pr-4">
											{formatMoney(row.plannedCents)}
										</td>
										<td className="py-3 pr-4">{formatMoney(row.spentCents)}</td>
										<td className="py-3 pr-4">
											<span>{formatPercent(row.percent)}</span>
											<Progress
												className="mt-2 h-1.5"
												value={Math.min(100, row.percent * 100)}
											/>
										</td>
										<td className="py-3 pr-4">
											<StatusBadge status={row.status} />
										</td>
										<td className="py-3 pr-4">
											<div className="flex gap-2">
												<BudgetDialog
													budget={budget}
													categories={categories}
													groups={groups}
													monthKey={monthKey}
												/>
												<BudgetDeleteDialog
													action={deleteBudget}
													budgetId={row.budgetId}
													isRecurring={Boolean(budget.templateId)}
												/>
											</div>
										</td>
									</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function BudgetDialog({
	monthKey,
	groups,
	categories,
	budget,
}: {
	monthKey: string;
	groups: GroupRow[];
	categories: CategoryRow[];
	budget?: BudgetRow;
}) {
	const isTemplateOverride = Boolean(budget?.templateId);
	return (
		<ActionDialog
			action={createOrUpdateBudget}
			description={
				isTemplateOverride
					? "Este valor sobrescreve apenas este mês. Os próximos meses continuam seguindo o orçamento recorrente."
					: "Use mês geral, grupo ou categoria de despesa. Valores são salvos em BRL."
			}
			formClassName="grid gap-4"
			pendingLabel={budget ? "Salvando..." : "Cadastrando..."}
			submitLabel={budget ? "Salvar" : "Cadastrar"}
			successMessage={
				budget
					? isTemplateOverride
						? "Override do mês salvo."
						: "Orçamento atualizado."
					: "Orçamento criado."
			}
			title={budget ? "Editar orçamento" : "Novo orçamento"}
			trigger={
				<Button
					size={budget ? "sm" : "default"}
					variant={budget ? "outline" : "default"}
				>
					{budget ? (
						"Editar"
					) : (
						<>
							<Plus className="size-4" />
							Novo orçamento
						</>
					)}
				</Button>
			}
		>
			<input name="monthKey" type="hidden" value={monthKey} />
			{budget ? <input name="id" type="hidden" value={budget.id} /> : null}
			<div className="grid gap-4 sm:grid-cols-2">
				<BudgetFormFields
					categories={categories.map((category) => ({
						id: category.id,
						name: category.name,
					}))}
					defaultCategoryGroupId={budget?.categoryGroupId ?? null}
					defaultCategoryId={budget?.categoryId ?? null}
					defaultScope={budget?.scope ?? "month"}
					groups={groups.map((group) => ({
						id: group.id,
						name: group.name,
					}))}
					selectClassName={selectClass}
				/>
				<div className="grid gap-2">
					<Label htmlFor="budget-amount">Valor</Label>
					<Input
						defaultValue={budget ? formatMoneyInput(budget.amountCents) : ""}
						id="budget-amount"
						name="amount"
						placeholder="Valor"
					/>
				</div>
			</div>
			<p className="text-muted-foreground text-xs">
				Para mês geral, deixe grupo e categoria vazios. Para grupo, selecione só
				grupo. Para categoria, selecione só categoria.
			</p>
			{budget ? null : (
				<label className="flex items-start gap-2 rounded-md border p-3 text-sm">
					<input className="mt-1" name="repeatEveryMonth" type="checkbox" />
					<span>
						Repetir todo mês a partir de <strong>{monthKey}</strong>.
					</span>
				</label>
			)}
		</ActionDialog>
	);
}

function RecurringBudgetTable({
	categories,
	groups,
	monthKey,
	rows,
}: {
	categories: CategoryRow[];
	groups: GroupRow[];
	monthKey: string;
	rows: BudgetTemplateRow[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Orçamentos recorrentes</CardTitle>
				<CardDescription>
					Esses valores são aplicados automaticamente quando um novo mês é usado.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<EmptyState
						description="Marque 'Repetir todo mês' ao criar um orçamento para transformar em recorrente."
						icon={PiggyBank}
						title="Sem recorrências"
					/>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[820px] text-left text-sm">
							<thead className="text-muted-foreground">
								<tr className="border-b">
									<th className="py-2 pr-4">Nome</th>
									<th className="py-2 pr-4">Escopo</th>
									<th className="py-2 pr-4">Valor padrão</th>
									<th className="py-2 pr-4">Ativo desde</th>
									<th className="py-2 pr-4">Ações</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr className="border-b" key={row.id}>
										<td className="py-3 pr-4">
											{budgetTargetLabel(row, categories, groups)}
										</td>
										<td className="py-3 pr-4">{scopeLabel(row.scope)}</td>
										<td className="py-3 pr-4">
											{formatMoney(row.amountCents)}
										</td>
										<td className="py-3 pr-4">
											{formatMonthLabel(
												parseMonthPeriod(row.startsAtMonthKey) ?? {
													key: row.startsAtMonthKey,
													start: `${row.startsAtMonthKey}-01`,
													end: `${row.startsAtMonthKey}-01`,
												},
											)}
										</td>
										<td className="py-3 pr-4">
											<div className="flex gap-2">
												<RecurringBudgetDialog
													monthKey={monthKey}
													name={budgetTargetLabel(row, categories, groups)}
													template={row}
												/>
												<ConfirmDialog
													action={archiveBudgetTemplate}
													confirmLabel="Excluir"
													destructive
													description="Remove o orçamento recorrente do mês atual em diante."
													errorMessage="Não foi possível excluir o orçamento recorrente."
													hidden={{
														currentMonthKey: monthKey,
														templateId: row.id,
													}}
													successMessage="Orçamento recorrente excluído."
													title="Excluir orçamento recorrente?"
													trigger={
														<Button size="sm" variant="destructive">
															Excluir
														</Button>
													}
												/>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RecurringBudgetDialog({
	monthKey,
	name,
	template,
}: {
	monthKey: string;
	name: string;
	template: BudgetTemplateRow;
}) {
	return (
		<ActionDialog
			action={updateBudgetTemplate}
			description={`Atualiza o valor padrão recorrente para ${name}. Overrides já feitos em meses específicos continuam preservados.`}
			formClassName="grid gap-4"
			pendingLabel="Salvando..."
			submitLabel="Salvar"
			successMessage="Orçamento recorrente atualizado."
			title="Editar orçamento recorrente"
			trigger={
				<Button size="sm" variant="outline">
					Editar
				</Button>
			}
		>
			<input name="currentMonthKey" type="hidden" value={monthKey} />
			<input name="id" type="hidden" value={template.id} />
			<div className="grid gap-2">
				<Label htmlFor={`budget-template-amount-${template.id}`}>Valor padrão</Label>
				<Input
					defaultValue={formatMoneyInput(template.amountCents)}
					id={`budget-template-amount-${template.id}`}
					name="amount"
					placeholder="Valor"
				/>
			</div>
			<p className="text-muted-foreground text-xs">
				Ativo desde {template.startsAtMonthKey}. Para trocar escopo, exclua este
				recorrente e crie outro.
			</p>
		</ActionDialog>
	);
}

function rowToBudget(row: UsageRow, monthKey: string): BudgetRow {
	return {
		id: row.budgetId,
		userId: "",
		monthKey,
		scope: row.scope,
		categoryGroupId: row.scope === "category_group" ? row.refId : null,
		categoryId: row.scope === "category" ? row.refId : null,
		templateId: null,
		amountCents: row.plannedCents,
		notes: null,
		createdAt: new Date(),
		updatedAt: null,
	};
}

function StatusBadge({ status }: { status: UsageRow["status"] }) {
	const variant =
		status === "over"
			? "destructive"
			: status === "near"
				? "secondary"
				: "outline";
	return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

function HistoryLink({
	active,
	href,
	label,
}: {
	active: boolean;
	href: string;
	label: string;
}) {
	return (
		<Button asChild size="sm" variant={active ? "default" : "outline"}>
			<Link href={href}>{label}</Link>
		</Button>
	);
}

function consolidatedPlanned(budgets: BudgetRow[]) {
	const monthBudget = budgets.find((budget) => budget.scope === "month");
	if (monthBudget) return monthBudget.amountCents;
	const groupBudgets = budgets.filter(
		(budget) => budget.scope === "category_group",
	);
	if (groupBudgets.length > 0)
		return groupBudgets.reduce(
			(total, budget) => total + budget.amountCents,
			0,
		);
	return budgets
		.filter((budget) => budget.scope === "category")
		.reduce((total, budget) => total + budget.amountCents, 0);
}

function parseHistorySelection(value: string | undefined): {
	key: string;
	refId: number | null;
	scope: BudgetScope;
} {
	if (!value || value === "month")
		return { key: "month", refId: null, scope: "month" };
	const [type, rawId] = value.split(":");
	const refId = rawId ? Number.parseInt(rawId, 10) : NaN;
	if (type === "group" && Number.isFinite(refId))
		return { key: value, refId, scope: "category_group" };
	if (type === "category" && Number.isFinite(refId))
		return { key: value, refId, scope: "category" };
	return { key: "month", refId: null, scope: "month" };
}

function statusLabel(status: UsageRow["status"] | "ok" | "near" | "over") {
	return { near: "Perto", ok: "OK", over: "Acima" }[status];
}

function scopeLabel(scope: BudgetScope) {
	return {
		category: "Categoria",
		category_group: "Grupo",
		month: "Mês geral",
	}[scope];
}

function statusTone(status: "ok" | "near" | "over") {
	return { near: "warning", ok: "success", over: "destructive" }[status] as
		| "destructive"
		| "success"
		| "warning";
}

function moneyOrDash(value: number | null) {
	return value === null ? "—" : formatMoney(value);
}

function budgetTargetLabel(
	target: Pick<BudgetTemplateRow, "scope" | "categoryGroupId" | "categoryId">,
	categories: CategoryRow[],
	groups: GroupRow[],
) {
	if (target.scope === "month") return "Mês geral";
	if (target.scope === "category_group") {
		return (
			groups.find((group) => group.id === target.categoryGroupId)?.name ??
			"Grupo removido"
		);
	}
	return (
		categories.find((category) => category.id === target.categoryId)?.name ??
		"Categoria removida"
	);
}

function lastMonthKeys(monthKey: string, count: number) {
	const [year, month] = monthKey.split("-").map(Number);
	return Array.from(
		{ length: count },
		(_, index) =>
			getMonthPeriod(new Date(year ?? 0, (month ?? 1) - count + index, 1)).key,
	);
}

function monthStartDate(monthKey: string) {
	const [year, month] = monthKey.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, 1);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
