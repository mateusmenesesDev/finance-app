import Link from "next/link";

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
import { Label } from "~/components/ui/label";
import { formatDate } from "~/lib/formatters";
import type { ReportFilters } from "~/lib/reports";

const selectClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
		<Card>
			<CardHeader>
				<CardTitle>Filtros</CardTitle>
				<CardDescription>
					Mostrando de {formatDate(filters.from)} a {formatDate(filters.to)},
					granularidade {filters.granularity}, filtros aplicados: {active}.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form action="/reports" className="grid gap-4" method="get">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Field label="Data inicial">
							<Input
								defaultValue={filters.from}
								max={filters.to}
								name="startDate"
								required
								type="date"
							/>
						</Field>
						<Field label="Data final">
							<Input
								defaultValue={filters.to}
								min={filters.from}
								name="endDate"
								required
								type="date"
							/>
						</Field>
						<Field label="Granularidade">
							<select
								className={selectClass}
								defaultValue={filters.granularity}
								name="granularity"
							>
								<option value="day">Dia</option>
								<option value="week">Semana</option>
								<option value="month">Mês</option>
								<option value="year">Ano</option>
							</select>
						</Field>
					</div>
					<details className="rounded-md border p-4">
						<summary className="cursor-pointer font-medium text-sm">
							Filtros avançados
						</summary>
						<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<Field label="Conta">
								<select
									className={selectClass}
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
									className={selectClass}
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
									className={selectClass}
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
								<select
									className={selectClass}
									defaultValue={filters.movementType ?? ""}
									name="type"
								>
									<option value="">Todos</option>
									<option value="income">Receita</option>
									<option value="expense">Despesa</option>
									<option value="transfer">Transferência</option>
									<option value="credit_card_payment">
										Pagamento de fatura
									</option>
									<option value="balance_adjustment">Ajuste</option>
								</select>
							</Field>
						</div>
					</details>
					<div className="flex items-center gap-3">
						<SubmitButton pendingLabel="Aplicando...">Aplicar</SubmitButton>
						<Button asChild variant="ghost">
							<Link href="/reports">Limpar</Link>
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
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
		<div className="grid gap-2">
			<Label>{label}</Label>
			{children}
		</div>
	);
}
