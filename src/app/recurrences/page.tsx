import { and, asc, eq, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { CalendarClock, Plus, Repeat } from "lucide-react";
import { redirect } from "next/navigation";

import {
	archiveRecurrence,
	confirmRecurrenceOccurrence,
	createRecurrence,
	updateRecurrence,
} from "~/app/_actions/finance-actions";
import { ActionDialog } from "~/components/action-dialog";
import { AppShell } from "~/components/app-shell";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatDate, formatMoney } from "~/lib/formatters";
import {
	generateOccurrences,
	lateRecurrences,
	type RecurrenceInput,
	rankFixedExpenses,
	subscriptionReviewSuggestions,
} from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	financialAccounts,
	recurrences,
	transactions,
} from "~/server/db/schema";
import { userTag } from "~/server/invalidate";

const frequencyOptions = {
	once: "Uma vez",
	weekly: "Semanal",
	monthly: "Mensal",
	yearly: "Anual",
};
const movementOptions = { income: "Receita", expense: "Despesa" };
const weekdayOptions = {
	"0": "Domingo",
	"1": "Segunda",
	"2": "Terça",
	"3": "Quarta",
	"4": "Quinta",
	"5": "Sexta",
	"6": "Sábado",
};

type RecurrenceRow = typeof recurrences.$inferSelect;
type AccountRow = typeof financialAccounts.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

export default async function RecurrencesPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");
	const today = isoToday();
	const nextWindow = { start: today, end: addDaysIso(today, 30) };

	const { allRecurrences, allAccounts, allCategories, confirmedRows } =
		await loadRecurrencesData(session.user.id);

	const confirmed = confirmedRows.flatMap((row) =>
		row.recurrenceId && row.occurrenceOn
			? [{ recurrenceId: row.recurrenceId, occurrenceOn: row.occurrenceOn }]
			: [],
	);
	const confirmedSet = new Set(
		confirmed.map((row) => `${row.recurrenceId}:${row.occurrenceOn}`),
	);
	const activeRecurrences = allRecurrences.filter((item) => !item.isArchived);
	const archivedRecurrences = allRecurrences.filter((item) => item.isArchived);
	const activeAccounts = allAccounts.filter(
		(account) => !account.isArchived && account.isActive,
	);
	const activeCategories = allCategories.filter(
		(category) => !category.isArchived,
	);
	const accountOptions = Object.fromEntries(
		activeAccounts.map((account) => [String(account.id), account.name]),
	);
	const categoryOptions = {
		"": "Sem categoria (só contas a pagar/receber)",
		...Object.fromEntries(
			activeCategories.map((category) => [
				String(category.id),
				`${category.kind === "income" ? "Receita" : "Despesa"} · ${category.name}`,
			]),
		),
	};
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const categoryById = new Map(
		allCategories.map((category) => [category.id, category]),
	);
	const late = lateRecurrences(activeRecurrences, confirmed, today);
	const fixedRanking = rankFixedExpenses(activeRecurrences);
	const reviewIds = new Set(
		subscriptionReviewSuggestions(activeRecurrences, confirmed, today).map(
			(item) => item.recurrenceId,
		),
	);
	const upcoming = activeRecurrences.flatMap((recurrence) =>
		generateOccurrences(recurrence, nextWindow)
			.filter(
				(occurrence) =>
					!confirmedSet.has(
						`${occurrence.recurrenceId}:${occurrence.occurrenceOn}`,
					),
			)
			.map((occurrence) => ({
				recurrence,
				occurrenceOn: occurrence.occurrenceOn,
			})),
	);
	const monthlyTotal = fixedRanking.reduce(
		(total, item) => total + item.monthlyAmountCents,
		0,
	);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={
					<RecurrenceDialog
						accountOptions={accountOptions}
						categoryOptions={categoryOptions}
					/>
				}
				description="Cadastre receitas, contas, despesas fixas e assinaturas para alimentar o fluxo de caixa previsto."
				eyebrow="Recorrências"
				title="Recorrências"
			/>

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={Repeat}
					label="Ativas"
					value={String(activeRecurrences.length)}
				/>
				<StatCard
					label="Total mensal previsto"
					value={formatMoney(monthlyTotal)}
				/>
				<StatCard
					label="Assinaturas ativas"
					value={String(
						activeRecurrences.filter((item) => item.isSubscription).length,
					)}
				/>
				<StatCard
					label="Atrasadas"
					tone={late.length > 0 ? "destructive" : "success"}
					value={String(late.length)}
				/>
			</section>

			{late.length > 0 ? (
				<Card className="border-destructive/40">
					<CardHeader>
						<CardTitle>Recorrências atrasadas</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						{late.map(({ recurrence, occurrenceOn }) => (
							<OccurrenceRow
								key={`${recurrence.id}-${occurrenceOn}`}
								occurrenceOn={occurrenceOn}
								recurrence={recurrence}
								status="late"
							/>
						))}
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Próximas ocorrências (30 dias)</CardTitle>
				</CardHeader>
				<CardContent>
					{upcoming.length > 0 ? (
						<div className="grid gap-3">
							{upcoming.map(({ recurrence, occurrenceOn }) => (
								<OccurrenceRow
									editable
									key={`${recurrence.id}-${occurrenceOn}`}
									occurrenceOn={occurrenceOn}
									recurrence={recurrence}
									status="upcoming"
								/>
							))}
						</div>
					) : (
						<EmptyState
							description="Nenhuma ocorrência prevista nos próximos 30 dias."
							icon={CalendarClock}
							title="Sem próximas ocorrências"
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lista de recorrências ativas</CardTitle>
				</CardHeader>
				<CardContent>
					{activeRecurrences.length > 0 ? (
						<div className="grid gap-3">
							{activeRecurrences.map((recurrence) => (
								<RecurrenceCard
									account={accountById.get(recurrence.accountId)}
									accountOptions={accountOptions}
									category={
										recurrence.categoryId
											? categoryById.get(recurrence.categoryId)
											: undefined
									}
									categoryOptions={categoryOptions}
									key={recurrence.id}
									nextOn={nextOccurrence(recurrence, confirmedSet, today)}
									recurrence={recurrence}
									review={reviewIds.has(recurrence.id)}
								/>
							))}
						</div>
					) : (
						<EmptyState
							description="Nenhuma recorrência ativa."
							icon={Repeat}
							title="Sem recorrências"
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recorrências arquivadas</CardTitle>
				</CardHeader>
				<CardContent>
					{archivedRecurrences.length > 0 ? (
						<div className="grid gap-2">
							{archivedRecurrences.map((recurrence) => (
								<form
									action={archiveRecurrence}
									className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-4"
									key={recurrence.id}
								>
									<div>
										<p className="font-medium">{recurrence.name}</p>
										<p className="text-muted-foreground text-xs">
											{formatMoney(recurrence.amountCents)} ·{" "}
											{humanFrequency(recurrence)}
										</p>
									</div>
									<input name="id" type="hidden" value={recurrence.id} />
									<input name="isArchived" type="hidden" value="false" />
									<SubmitButton
										formAction={archiveRecurrence}
										pendingLabel="Reativando..."
										variant="secondary"
									>
										Reativar
									</SubmitButton>
								</form>
							))}
						</div>
					) : (
					<EmptyState
						description="Nenhuma recorrência arquivada."
						title="Sem arquivadas"
					/>
				)}
			</CardContent>
		</Card>
	</AppShell>
	);
}

function loadRecurrencesData(userId: string) {
	return unstable_cache(
		async () => {
			const [allRecurrences, allAccounts, allCategories, confirmedRows] =
				await Promise.all([
					db
						.select()
						.from(recurrences)
						.where(eq(recurrences.userId, userId))
						.orderBy(asc(recurrences.isArchived), asc(recurrences.name)),
					db
						.select()
						.from(financialAccounts)
						.where(eq(financialAccounts.userId, userId))
						.orderBy(asc(financialAccounts.name)),
					db
						.select()
						.from(categories)
						.where(eq(categories.userId, userId))
						.orderBy(asc(categories.kind), asc(categories.name)),
					db
						.select({
							recurrenceId: transactions.recurrenceId,
							occurrenceOn: transactions.recurrenceOccurrenceOn,
						})
						.from(transactions)
						.where(
							and(
								eq(transactions.userId, userId),
								isNotNull(transactions.recurrenceId),
							),
						),
				]);
			return { allRecurrences, allAccounts, allCategories, confirmedRows };
		},
		[`recurrences-data:${userId}`],
		{
			tags: [
				userTag(userId, "recurrences"),
				userTag(userId, "transactions"),
				userTag(userId, "accounts"),
				userTag(userId, "categories"),
			],
			revalidate: 3600,
		},
	)();
}

function OccurrenceRow({
	recurrence,
	occurrenceOn,
	editable = false,
	status,
}: {
	recurrence: RecurrenceInput;
	occurrenceOn: string;
	editable?: boolean;
	status: "late" | "upcoming";
}) {
	return (
		<form
			action={confirmRecurrenceOccurrence}
			className="grid gap-3 rounded-md border bg-muted/20 p-4 md:grid-cols-[1fr_auto] md:items-end"
		>
			<div>
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-medium">{recurrence.name}</p>
					<Badge variant={status === "late" ? "destructive" : "default"}>
						{status === "late" ? "Atrasada" : "Próxima"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					{formatDate(occurrenceOn)} · {formatMoney(recurrence.amountCents)}
				</p>
				<input name="recurrenceId" type="hidden" value={recurrence.id} />
				<input name="occurrenceOn" type="hidden" value={occurrenceOn} />
				<input
					name="amountCents"
					type="hidden"
					value={recurrence.amountCents}
				/>
				{editable ? (
					<div className="mt-3 grid gap-3 md:grid-cols-3">
						<Input defaultValue={recurrence.name} name="description" />
						<Input defaultValue={occurrenceOn} name="occurredOn" type="date" />
						<Input
							defaultValue={moneyValue(recurrence.amountCents)}
							name="amount"
						/>
					</div>
				) : null}
			</div>
			<SubmitButton pendingLabel="Confirmando...">
				Confirmar ocorrência
			</SubmitButton>
		</form>
	);
}

function RecurrenceCard({
	recurrence,
	account,
	category,
	nextOn,
	accountOptions,
	categoryOptions,
	review,
}: {
	recurrence: RecurrenceRow;
	account?: AccountRow;
	category?: CategoryRow;
	nextOn: string | null;
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
	review: boolean;
}) {
	return (
		<div className="rounded-md border bg-muted/20 p-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{recurrence.name}</p>
						<Badge
							variant={
								recurrence.movementType === "income" ? "default" : "secondary"
							}
						>
							{recurrence.movementType === "income" ? "Receita" : "Despesa"}
						</Badge>
						{recurrence.isBill ? <Badge variant="outline">Conta</Badge> : null}
						{recurrence.isSubscription ? (
							<Badge variant="outline">Assinatura</Badge>
						) : null}
						{review ? <Badge variant="secondary">Revisar</Badge> : null}
						{nextOn ? <Badge variant="secondary">OK</Badge> : null}
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{account?.name ?? "Conta removida"} ·{" "}
						{category?.name ?? "Sem categoria"} · {humanFrequency(recurrence)}
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Próxima: {nextOn ? formatDate(nextOn) : "sem ocorrência futura"}
					</p>
				</div>
				<Money
					cents={recurrence.amountCents}
					className="font-semibold"
					sign={recurrence.movementType === "income" ? "credit" : "debit"}
				/>
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<RecurrenceDialog
					accountOptions={accountOptions}
					categoryOptions={categoryOptions}
					recurrence={recurrence}
				/>
				<ConfirmDialog
					action={archiveRecurrence}
					confirmLabel="Arquivar"
					destructive
					errorMessage="Não foi possível arquivar a recorrência."
					hidden={{ id: recurrence.id, isArchived: "true" }}
					successMessage="Recorrência arquivada."
					title="Arquivar recorrência?"
					trigger={
						<Button size="sm" variant="destructive">
							Arquivar
						</Button>
					}
				/>
			</div>
		</div>
	);
}

function RecurrenceDialog({
	accountOptions,
	categoryOptions,
	recurrence,
}: {
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
	recurrence?: RecurrenceRow;
}) {
	return (
		<ActionDialog
			action={recurrence ? updateRecurrence : createRecurrence}
			contentClassName="sm:max-w-3xl"
			description="Marque conta a pagar/receber quando não houver categoria ainda; assinatura indica gasto recorrente que deve ser revisado periodicamente."
			footerClassName="sm:col-span-2 lg:col-span-3"
			formClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
			pendingLabel={recurrence ? "Salvando..." : "Cadastrando..."}
			submitLabel={recurrence ? "Salvar" : "Cadastrar"}
			successMessage={
				recurrence ? "Recorrência atualizada." : "Recorrência criada."
			}
			title={recurrence ? "Editar recorrência" : "Nova recorrência"}
			trigger={
				<Button
					size={recurrence ? "sm" : "default"}
					variant={recurrence ? "outline" : "default"}
				>
					{recurrence ? (
						"Editar"
					) : (
						<>
							<Plus className="size-4" />
							Nova recorrência
						</>
					)}
				</Button>
			}
		>
			<RecurrenceForm
				accountOptions={accountOptions}
				categoryOptions={categoryOptions}
				recurrence={recurrence}
			/>
		</ActionDialog>
	);
}

function RecurrenceForm({
	accountOptions,
	categoryOptions,
	recurrence,
}: {
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
	recurrence?: RecurrenceRow;
}) {
	return (
		<>
			{recurrence ? (
				<input name="id" type="hidden" value={recurrence.id} />
			) : null}
			<Field defaultValue={recurrence?.name} label="Nome" name="name" />
			<SelectField
				defaultValue={recurrence?.movementType ?? "expense"}
				label="Tipo"
				name="movementType"
				options={movementOptions}
			/>
			<SelectField
				defaultValue={
					recurrence?.accountId ? String(recurrence.accountId) : undefined
				}
				label="Conta"
				name="accountId"
				options={accountOptions}
			/>
			<SelectField
				defaultValue={
					recurrence?.categoryId ? String(recurrence.categoryId) : ""
				}
				label="Categoria"
				name="categoryId"
				options={categoryOptions}
			/>
			<Field
				defaultValue={
					recurrence ? moneyValue(recurrence.amountCents) : undefined
				}
				label="Valor"
				name="amount"
			/>
			<SelectField
				defaultValue={recurrence?.frequency ?? "monthly"}
				label="Frequência"
				name="frequency"
				options={frequencyOptions}
			/>
			<Field
				defaultValue={recurrence?.intervalCount ?? 1}
				label="A cada"
				min={1}
				name="intervalCount"
				type="number"
			/>
			<Field
				defaultValue={recurrence?.startsOn ?? isoToday()}
				label="Início"
				name="startsOn"
				type="date"
			/>
			<Field
				defaultValue={recurrence?.endsOn ?? ""}
				label="Fim"
				name="endsOn"
				type="date"
			/>
			<Field
				defaultValue={recurrence?.anchorDay ?? ""}
				label="Dia do mês"
				max={31}
				min={1}
				name="anchorDay"
				type="number"
			/>
			<SelectField
				defaultValue={
					recurrence?.anchorWeekday === null ||
					recurrence?.anchorWeekday === undefined
						? ""
						: String(recurrence.anchorWeekday)
				}
				label="Dia da semana"
				name="anchorWeekday"
				options={{ "": "Usar início", ...weekdayOptions }}
			/>
			<Field
				defaultValue={recurrence?.description ?? ""}
				label="Descrição"
				name="description"
			/>
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Checkbox
					defaultChecked={recurrence?.isBill ?? false}
					id="recurrence-isBill"
					name="isBill"
				/>
				<Label htmlFor="recurrence-isBill">Conta a pagar/receber</Label>
			</div>
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Checkbox
					defaultChecked={recurrence?.isSubscription ?? false}
					id="recurrence-isSubscription"
					name="isSubscription"
				/>
				<Label htmlFor="recurrence-isSubscription">Assinatura</Label>
			</div>
		</>
	);
}

function Field({
	label,
	name,
	...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`recurrence-${name}`}>{label}</Label>
			<Input id={`recurrence-${name}`} name={name} {...props} />
		</div>
	);
}

function SelectField({
	label,
	name,
	options,
	defaultValue,
}: {
	label: string;
	name: string;
	options: Record<string, string>;
	defaultValue?: string;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`recurrence-${name}`}>{label}</Label>
			<select
				className={selectClass}
				defaultValue={defaultValue}
				id={`recurrence-${name}`}
				name={name}
			>
				{Object.entries(options).map(([value, label]) => (
					<option key={value} value={value}>
						{label}
					</option>
				))}
			</select>
		</div>
	);
}

function humanFrequency(recurrence: RecurrenceInput) {
	const every =
		recurrence.intervalCount > 1 ? ` a cada ${recurrence.intervalCount} ` : "";
	if (recurrence.frequency === "once") return "Uma vez";
	if (recurrence.frequency === "weekly")
		return recurrence.intervalCount > 1 ? `Semanal${every}semanas` : "Semanal";
	if (recurrence.frequency === "monthly")
		return recurrence.intervalCount > 1 ? `Mensal${every}meses` : "Mensal";
	return recurrence.intervalCount > 1 ? `Anual${every}anos` : "Anual";
}

function nextOccurrence(
	recurrence: RecurrenceInput,
	confirmedSet: Set<string>,
	today: string,
) {
	return (
		generateOccurrences(recurrence, {
			start: today,
			end: addDaysIso(today, 366),
		}).find(
			(occurrence) =>
				!confirmedSet.has(
					`${occurrence.recurrenceId}:${occurrence.occurrenceOn}`,
				),
		)?.occurrenceOn ?? null
	);
}

function isoToday() {
	return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number) {
	const date = new Date(`${dateIso}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function moneyValue(cents: number) {
	return (cents / 100).toFixed(2);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
