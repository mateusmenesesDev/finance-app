import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	copyBudgetMonth,
	createOrUpdateBudget,
	deleteBudget,
} from "~/app/_actions/finance-actions";
import {
	BudgetProgress,
	FinanceShell,
	inputClass,
	Panel,
	Select,
	SubmitButton,
	SummaryCard,
	TextInput,
} from "~/app/_components/finance-ui";
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
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	monthlyBudgets,
	transactions,
} from "~/server/db/schema";

type BudgetsPageProps = {
	searchParams?: Promise<{
		edit?: string;
		historyScope?: string;
		month?: string;
	}>;
};

const scopeLabels = {
	category: "Categoria",
	category_group: "Grupo de categoria",
	month: "Mês geral",
};

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const params = await searchParams;
	const period = params?.month
		? (parseMonthPeriod(params.month) ?? getMonthPeriod())
		: getMonthPeriod();
	const editId = params?.edit ? Number.parseInt(params.edit, 10) : null;
	const [allBudgets, allCategories, allGroups, allTransactions] =
		await Promise.all([
			db
				.select()
				.from(monthlyBudgets)
				.where(eq(monthlyBudgets.userId, session.user.id))
				.orderBy(asc(monthlyBudgets.monthKey), asc(monthlyBudgets.scope)),
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
	const monthBudgets = allBudgets.filter(
		(budget) => budget.monthKey === period.key,
	);
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
	const editingBudget = editId
		? allBudgets.find((budget) => budget.id === editId)
		: null;
	const historySelection = parseHistorySelection(params?.historyScope);
	const historyMonthKeys = lastMonthKeys(period.key, 6);
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
		<FinanceShell
			description="Planeje limites mensais e acompanhe previsto vs realizado por mês, grupo e categoria."
			eyebrow="Orçamento"
			title={`Orçamento de ${formatMonthLabel(period)}`}
		>
			<Panel title="Mês analisado">
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div>
						<p className="text-[color:var(--color-text-muted)] text-sm">
							{period.key}
						</p>
						<p className="mt-1 text-[color:var(--color-text-subtle)] text-sm capitalize">
							{formatMonthLabel(period)}
						</p>
					</div>
					<form className="flex flex-wrap items-end gap-3">
						<label
							className="grid gap-1 text-[color:var(--color-text-muted)] text-sm"
							htmlFor="budget-month"
						>
							Mês
							<TextInput
								defaultValue={period.key}
								id="budget-month"
								name="month"
								type="month"
							/>
						</label>
						<SubmitButton pendingLabel="Atualizando...">Atualizar</SubmitButton>
					</form>
				</div>
				<div className="mt-6 grid gap-4 md:grid-cols-4">
					<SummaryCard
						label="Previsto consolidado"
						value={plannedCents ? formatMoney(plannedCents) : "Não configurado"}
						variant={plannedCents ? "default" : "warn"}
					/>
					<SummaryCard
						label="Realizado"
						value={formatMoney(totalSpentCents)}
						variant="bad"
					/>
					<SummaryCard
						label="Consumido"
						value={plannedCents ? formatPercent(summaryPercent) : "—"}
						variant={statusVariant(summaryStatus)}
					/>
					<SummaryCard
						label="Status"
						value={statusLabel(summaryStatus)}
						variant={statusVariant(summaryStatus)}
					/>
				</div>
				{plannedCents ? <BudgetProgress percent={summaryPercent} /> : null}
			</Panel>

			{coherenceWarnings.length > 0 ? (
				<Panel title="Avisos de coerência">
					<ul className="grid gap-2 text-[color:var(--color-warn)] text-sm">
						{coherenceWarnings.map((warning) => (
							<li
								className="rounded-2xl border border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-bg)] p-4"
								key={warning}
							>
								{warning}
							</li>
						))}
					</ul>
				</Panel>
			) : null}

			<Panel
				description="Use mês geral, grupo ou categoria de despesa. Valores são salvos em BRL."
				title={editingBudget ? "Editar orçamento" : "Novo orçamento"}
			>
				<form
					action={createOrUpdateBudget}
					className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 md:grid-cols-5"
				>
					<input name="monthKey" type="hidden" value={period.key} />
					{editingBudget ? (
						<input name="id" type="hidden" value={editingBudget.id} />
					) : null}
					<Select
						defaultValue={editingBudget?.scope ?? "month"}
						name="scope"
						options={scopeLabels}
					/>
					<select
						className={inputClass}
						defaultValue={editingBudget?.categoryGroupId ?? ""}
						name="categoryGroupId"
					>
						<option value="">Sem grupo</option>
						{activeExpenseGroups.map((group) => (
							<option key={group.id} value={group.id}>
								{group.name}
							</option>
						))}
					</select>
					<select
						className={inputClass}
						defaultValue={editingBudget?.categoryId ?? ""}
						name="categoryId"
					>
						<option value="">Sem categoria</option>
						{activeExpenseCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					<TextInput
						defaultValue={
							editingBudget ? formatMoneyInput(editingBudget.amountCents) : ""
						}
						name="amount"
						placeholder="Valor"
					/>
					<SubmitButton
						pendingLabel={editingBudget ? "Salvando..." : "Cadastrando..."}
					>
						{editingBudget ? "Salvar" : "Cadastrar"}
					</SubmitButton>
				</form>
				<p className="mt-3 text-[color:var(--color-text-subtle)] text-xs">
					Para mês geral, deixe grupo e categoria vazios. Para grupo, selecione
					só grupo. Para categoria, selecione só categoria.
				</p>
			</Panel>

			<BudgetTable
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "month")}
				title="Mês geral"
			/>
			<BudgetTable
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "category_group")}
				title="Por grupo"
			/>
			<BudgetTable
				monthKey={period.key}
				rows={usageRows.filter((row) => row.scope === "category")}
				title="Por categoria"
			/>

			<Panel title="Copiar de outro mês">
				<form
					action={copyBudgetMonth}
					className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 md:grid-cols-[1fr_180px]"
				>
					<input name="targetMonthKey" type="hidden" value={period.key} />
					<select className={inputClass} name="sourceMonthKey">
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
			</Panel>

			<Panel
				description="Escolha um escopo para comparar previsto, realizado e variações."
				title="Histórico (6 meses)"
			>
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
						<thead className="text-[color:var(--color-text-muted)]">
							<tr className="border-[color:var(--color-border-subtle)] border-b">
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
								<tr
									className="border-[color:var(--color-border-subtle)] border-b"
									key={row.monthKey}
								>
									<td className="py-3 pr-4">{row.monthKey}</td>
									<td className="py-3 pr-4">{moneyOrDash(row.plannedCents)}</td>
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
			</Panel>
		</FinanceShell>
	);
}

type UsageRow = ReturnType<typeof buildBudgetUsage>[number];

function BudgetTable({
	monthKey,
	rows,
	title,
}: {
	monthKey: string;
	rows: UsageRow[];
	title: string;
}) {
	return (
		<Panel title={title}>
			{rows.length === 0 ? (
				<p className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 text-[color:var(--color-text-muted)] text-sm">
					Nenhum orçamento cadastrado.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[820px] text-left text-sm">
						<thead className="text-[color:var(--color-text-muted)]">
							<tr className="border-[color:var(--color-border-subtle)] border-b">
								<th className="py-2 pr-4">Nome</th>
								<th className="py-2 pr-4">Previsto</th>
								<th className="py-2 pr-4">Realizado</th>
								<th className="py-2 pr-4">%</th>
								<th className="py-2 pr-4">Status</th>
								<th className="py-2 pr-4">Ações</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									className="border-[color:var(--color-border-subtle)] border-b"
									key={row.budgetId}
								>
									<td className="py-3 pr-4">{row.name}</td>
									<td className="py-3 pr-4">{formatMoney(row.plannedCents)}</td>
									<td className="py-3 pr-4">{formatMoney(row.spentCents)}</td>
									<td className="py-3 pr-4">
										{formatPercent(row.percent)}
										<BudgetProgress percent={row.percent} />
									</td>
									<td className="py-3 pr-4">
										<StatusBadge status={row.status} />
									</td>
									<td className="flex gap-2 py-3 pr-4">
										<Link
											className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-[color:var(--color-text)] text-xs"
											href={`/budgets?month=${monthKey}&edit=${row.budgetId}`}
										>
											Editar
										</Link>
										<form action={deleteBudget}>
											<input name="id" type="hidden" value={row.budgetId} />
											<SubmitButton
												className="px-3 py-2 text-xs"
												pendingLabel="Excluindo..."
												variant="danger"
											>
												Excluir
											</SubmitButton>
										</form>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Panel>
	);
}

function StatusBadge({ status }: { status: UsageRow["status"] }) {
	const className = {
		near: "border-[color:var(--color-warn-border)] text-[color:var(--color-warn)]",
		ok: "border-[color:var(--color-good-border)] text-[color:var(--color-good)]",
		over: "border-[color:var(--color-bad-border)] text-[color:var(--color-bad)]",
	}[status];
	return (
		<span className={`rounded-full border px-3 py-1 text-xs ${className}`}>
			{statusLabel(status)}
		</span>
	);
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
		<Link
			className={`rounded-full border px-3 py-1 text-xs ${active ? "border-[color:var(--color-good-border)] text-[color:var(--color-good)]" : "border-[color:var(--color-border)] text-[color:var(--color-text-muted)]"}`}
			href={href}
		>
			{label}
		</Link>
	);
}

function consolidatedPlanned(budgets: (typeof monthlyBudgets.$inferSelect)[]) {
	const monthBudget = budgets.find((budget) => budget.scope === "month");
	if (monthBudget) return monthBudget.amountCents;
	const groupBudgets = budgets.filter(
		(budget) => budget.scope === "category_group",
	);
	if (groupBudgets.length > 0) {
		return groupBudgets.reduce(
			(total, budget) => total + budget.amountCents,
			0,
		);
	}
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
	if (type === "group" && Number.isFinite(refId)) {
		return { key: value, refId, scope: "category_group" };
	}
	if (type === "category" && Number.isFinite(refId)) {
		return { key: value, refId, scope: "category" };
	}
	return { key: "month", refId: null, scope: "month" };
}

function statusLabel(status: UsageRow["status"] | "ok" | "near" | "over") {
	return { near: "Perto", ok: "OK", over: "Acima" }[status];
}

function statusVariant(status: "ok" | "near" | "over") {
	return { near: "warn", ok: "good", over: "bad" }[status] as
		| "bad"
		| "good"
		| "warn";
}

function moneyOrDash(value: number | null) {
	return value === null ? "—" : formatMoney(value);
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
