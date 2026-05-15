import { and, asc, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
	archiveRecurrence,
	confirmRecurrenceOccurrence,
	createRecurrence,
	updateRecurrence,
} from "~/app/_actions/finance-actions";
import {
	FinanceShell,
	Panel,
	Select,
	SubmitButton,
	SummaryCard,
	TextInput,
} from "~/app/_components/finance-ui";
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

	const [allRecurrences, allAccounts, allCategories, confirmedRows] =
		await Promise.all([
			db
				.select()
				.from(recurrences)
				.where(eq(recurrences.userId, session.user.id))
				.orderBy(asc(recurrences.isArchived), asc(recurrences.name)),
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, session.user.id))
				.orderBy(asc(financialAccounts.name)),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, session.user.id))
				.orderBy(asc(categories.kind), asc(categories.name)),
			db
				.select({
					recurrenceId: transactions.recurrenceId,
					occurrenceOn: transactions.recurrenceOccurrenceOn,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.userId, session.user.id),
						isNotNull(transactions.recurrenceId),
					),
				),
		]);

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
		<FinanceShell
			description="Cadastre receitas, contas, despesas fixas e assinaturas para alimentar o fluxo de caixa previsto."
			eyebrow="Recorrências"
			title="Recorrências"
		>
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<SummaryCard label="Ativas" value={String(activeRecurrences.length)} />
				<SummaryCard
					label="Total mensal previsto"
					value={formatMoney(monthlyTotal)}
				/>
				<SummaryCard
					label="Assinaturas ativas"
					value={String(
						activeRecurrences.filter((item) => item.isSubscription).length,
					)}
				/>
				<SummaryCard
					label="Atrasadas"
					value={String(late.length)}
					variant={late.length > 0 ? "bad" : "good"}
				/>
			</section>

			{late.length > 0 ? (
				<Panel title="Recorrências atrasadas">
					<div className="grid gap-3">
						{late.map(({ recurrence, occurrenceOn }) => (
							<OccurrenceRow
								key={`${recurrence.id}-${occurrenceOn}`}
								occurrenceOn={occurrenceOn}
								recurrence={recurrence}
							/>
						))}
					</div>
				</Panel>
			) : null}

			<Panel title="Próximas ocorrências (30 dias)">
				{upcoming.length > 0 ? (
					<div className="grid gap-3">
						{upcoming.map(({ recurrence, occurrenceOn }) => (
							<OccurrenceRow
								editable
								key={`${recurrence.id}-${occurrenceOn}`}
								occurrenceOn={occurrenceOn}
								recurrence={recurrence}
							/>
						))}
					</div>
				) : (
					<Empty text="Nenhuma ocorrência prevista nos próximos 30 dias." />
				)}
			</Panel>

			<Panel title="Lista de recorrências ativas">
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
					<Empty text="Nenhuma recorrência ativa." />
				)}
			</Panel>

			<Panel title="Recorrências arquivadas">
				{archivedRecurrences.length > 0 ? (
					<div className="grid gap-2">
						{archivedRecurrences.map((recurrence) => (
							<form
								className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4"
								key={recurrence.id}
							>
								<div>
									<p className="font-medium">{recurrence.name}</p>
									<p className="text-[color:var(--color-text-subtle)] text-xs">
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
					<Empty text="Nenhuma recorrência arquivada." />
				)}
			</Panel>

			<Panel
				description="Marque conta a pagar/receber quando não houver categoria ainda; assinatura indica gasto recorrente que deve ser revisado periodicamente."
				title="Cadastrar recorrência"
			>
				<RecurrenceForm
					accountOptions={accountOptions}
					categoryOptions={categoryOptions}
				/>
			</Panel>
		</FinanceShell>
	);
}
function OccurrenceRow({
	recurrence,
	occurrenceOn,
	editable = false,
}: {
	recurrence: RecurrenceInput;
	occurrenceOn: string;
	editable?: boolean;
}) {
	return (
		<form
			action={confirmRecurrenceOccurrence}
			className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 md:grid-cols-[1fr_auto] md:items-end"
		>
			<div>
				<p className="font-medium">{recurrence.name}</p>
				<p className="text-[color:var(--color-text-subtle)] text-xs">
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
						<TextInput defaultValue={recurrence.name} name="description" />
						<TextInput
							defaultValue={occurrenceOn}
							name="occurredOn"
							type="date"
						/>
						<TextInput
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
		<div className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{recurrence.name}</p>
						<Chip>
							{recurrence.movementType === "income" ? "Receita" : "Despesa"}
						</Chip>
						{recurrence.isBill ? <Chip>Conta</Chip> : null}
						{recurrence.isSubscription ? <Chip>Assinatura</Chip> : null}
						{review ? <Chip tone="warn">Revisar</Chip> : null}
					</div>
					<p className="mt-2 text-[color:var(--color-text-subtle)] text-sm">
						{account?.name ?? "Conta removida"} ·{" "}
						{category?.name ?? "Sem categoria"} · {humanFrequency(recurrence)}
					</p>
					<p className="mt-1 text-[color:var(--color-text-subtle)] text-xs">
						Próxima: {nextOn ? formatDate(nextOn) : "sem ocorrência futura"}
					</p>
				</div>
				<p className="font-semibold">{formatMoney(recurrence.amountCents)}</p>
			</div>
			<details className="mt-4">
				<summary className="cursor-pointer text-[color:var(--color-text-muted)] text-sm">
					Editar / arquivar
				</summary>
				<div className="mt-4 grid gap-4">
					<RecurrenceForm
						accountOptions={accountOptions}
						categoryOptions={categoryOptions}
						recurrence={recurrence}
					/>
					<form action={archiveRecurrence}>
						<input name="id" type="hidden" value={recurrence.id} />
						<input name="isArchived" type="hidden" value="true" />
						<SubmitButton
							formAction={archiveRecurrence}
							pendingLabel="Arquivando..."
							variant="danger"
						>
							Arquivar
						</SubmitButton>
					</form>
				</div>
			</details>
		</div>
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
		<form
			action={recurrence ? updateRecurrence : createRecurrence}
			className="grid gap-4 md:grid-cols-4 md:items-end"
		>
			{recurrence ? (
				<input name="id" type="hidden" value={recurrence.id} />
			) : null}
			<Label text="Nome">
				<TextInput defaultValue={recurrence?.name} name="name" />
			</Label>
			<Label text="Tipo">
				<Select
					defaultValue={recurrence?.movementType ?? "expense"}
					name="movementType"
					options={movementOptions}
				/>
			</Label>
			<Label text="Conta">
				<Select
					defaultValue={
						recurrence?.accountId ? String(recurrence.accountId) : undefined
					}
					name="accountId"
					options={accountOptions}
				/>
			</Label>
			<Label text="Categoria">
				<Select
					defaultValue={
						recurrence?.categoryId ? String(recurrence.categoryId) : ""
					}
					name="categoryId"
					options={categoryOptions}
				/>
			</Label>
			<Label text="Valor">
				<TextInput
					defaultValue={
						recurrence ? moneyValue(recurrence.amountCents) : undefined
					}
					name="amount"
				/>
			</Label>
			<Label text="Frequência">
				<Select
					defaultValue={recurrence?.frequency ?? "monthly"}
					name="frequency"
					options={frequencyOptions}
				/>
			</Label>
			<Label text="A cada">
				<TextInput
					defaultValue={recurrence?.intervalCount ?? 1}
					min={1}
					name="intervalCount"
					type="number"
				/>
			</Label>
			<Label text="Início">
				<TextInput
					defaultValue={recurrence?.startsOn ?? isoToday()}
					name="startsOn"
					type="date"
				/>
			</Label>
			<Label text="Fim">
				<TextInput
					defaultValue={recurrence?.endsOn ?? ""}
					name="endsOn"
					type="date"
				/>
			</Label>
			<Label text="Dia do mês">
				<TextInput
					defaultValue={recurrence?.anchorDay ?? ""}
					max={31}
					min={1}
					name="anchorDay"
					type="number"
				/>
			</Label>
			<Label text="Dia da semana">
				<Select
					defaultValue={
						recurrence?.anchorWeekday === null ||
						recurrence?.anchorWeekday === undefined
							? ""
							: String(recurrence.anchorWeekday)
					}
					name="anchorWeekday"
					options={{ "": "Usar início", ...weekdayOptions }}
				/>
			</Label>
			<Label text="Descrição">
				<TextInput
					defaultValue={recurrence?.description ?? ""}
					name="description"
				/>
			</Label>
			<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
				<input
					defaultChecked={recurrence?.isBill ?? false}
					name="isBill"
					type="checkbox"
				/>{" "}
				Conta a pagar/receber
			</label>
			<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
				<input
					defaultChecked={recurrence?.isSubscription ?? false}
					name="isSubscription"
					type="checkbox"
				/>{" "}
				Assinatura
			</label>
			<SubmitButton
				pendingLabel={recurrence ? "Salvando..." : "Cadastrando..."}
			>
				{recurrence ? "Salvar" : "Cadastrar"}
			</SubmitButton>
		</form>
	);
}
function Label({
	text,
	children,
}: {
	text: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1 text-[color:var(--color-text-muted)] text-sm">
			<span>{text}</span>
			{children}
		</div>
	);
}
function Chip({
	children,
	tone = "default",
}: {
	children: React.ReactNode;
	tone?: "default" | "warn";
}) {
	return (
		<span
			className={
				tone === "warn"
					? "rounded-full bg-[color:var(--color-warn-bg)] px-2 py-1 text-[color:var(--color-warn)] text-xs"
					: "rounded-full bg-[color:var(--color-surface-muted)] px-2 py-1 text-[color:var(--color-text-muted)] text-xs"
			}
		>
			{children}
		</span>
	);
}
function Empty({ text }: { text: string }) {
	return (
		<p className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4 text-[color:var(--color-text-muted)] text-sm">
			{text}
		</p>
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
