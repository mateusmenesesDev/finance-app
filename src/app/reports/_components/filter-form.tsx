import Link from "next/link";

import { Select, SubmitButton, TextInput } from "~/app/_components/finance-ui";
import { formatDate } from "~/lib/formatters";
import type { ReportFilters } from "~/lib/reports";

type Option = { id: number; name: string };
export function ReportFilterForm({
	filters,
	accounts,
	groups,
	categories,
}: {
	filters: ReportFilters;
	accounts: Option[];
	groups: Option[];
	categories: Option[];
}) {
	const custom = filters.preset === "custom";
	const active =
		[
			filters.accountId && "conta",
			filters.groupId && "grupo",
			filters.categoryId && "categoria",
			filters.movementType && "tipo",
		]
			.filter(Boolean)
			.join(", ") || "nenhum";
	return (
		<form
			action="/reports"
			className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
			method="get"
		>
			<div className="grid gap-4 md:grid-cols-4">
				<Field label="Período">
					<Select
						defaultValue={filters.preset}
						name="preset"
						options={{
							current_month: "Mês atual",
							last_30d: "Últimos 30 dias",
							last_90d: "Últimos 90 dias",
							last_6m: "Últimos 6 meses",
							current_year: "Ano atual",
							last_12m: "Últimos 12 meses",
							custom: "Personalizado",
						}}
					/>
				</Field>
				<Field label="De">
					<TextInput
						defaultValue={filters.from}
						disabled={!custom}
						name="from"
						type="date"
					/>
				</Field>
				<Field label="Até">
					<TextInput
						defaultValue={filters.to}
						disabled={!custom}
						name="to"
						type="date"
					/>
				</Field>
				<Field label="Granularidade">
					<Select
						defaultValue={filters.granularity}
						name="granularity"
						options={{ day: "Dia", week: "Semana", month: "Mês", year: "Ano" }}
					/>
				</Field>
				<Field label="Conta">
					<select
						className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
						defaultValue={filters.accountId ?? ""}
						name="accountId"
					>
						<option value="">Todas</option>
						{accounts.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Grupo">
					<select
						className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
						defaultValue={filters.groupId ?? ""}
						name="groupId"
					>
						<option value="">Todos</option>
						{groups.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Categoria">
					<select
						className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
						defaultValue={filters.categoryId ?? ""}
						name="categoryId"
					>
						<option value="">Todas</option>
						{categories.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Tipo">
					<Select
						defaultValue={filters.movementType ?? ""}
						name="type"
						options={{
							"": "Todos",
							income: "Receita",
							expense: "Despesa",
							transfer: "Transferência",
							credit_card_payment: "Pagamento de fatura",
							balance_adjustment: "Ajuste",
						}}
					/>
				</Field>
			</div>
			<div className="mt-4 flex items-center gap-3">
				<SubmitButton>Aplicar</SubmitButton>
				<Link
					className="text-slate-400 text-sm hover:text-slate-100"
					href="/reports"
				>
					Limpar
				</Link>
			</div>
			<p className="mt-3 text-slate-400 text-sm">
				Mostrando de {formatDate(filters.from)} a {formatDate(filters.to)},
				granularidade {filters.granularity}, filtros aplicados: {active}.
			</p>
		</form>
	);
}
function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 text-slate-300 text-sm">
			<span>{label}</span>
			{children}
		</div>
	);
}
