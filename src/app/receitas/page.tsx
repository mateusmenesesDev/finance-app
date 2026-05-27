import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import {
	BanknoteArrowDown,
	CalendarClock,
	CheckCircle2,
	Plus,
} from "lucide-react";
import { redirect } from "next/navigation";

import {
	confirmRecurrenceOccurrence,
	createRecurrence,
	createTransaction,
	linkTransactionToRecurrence,
	updateRecurrence,
} from "~/app/_actions/finance-actions";
import { ActionDialog } from "~/components/action-dialog";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatDate, formatMoney, formatMoneyInput } from "~/lib/formatters";
import {
	generateOccurrences,
	lateRecurrences,
	type RecurrenceInput,
} from "~/lib/recurrences";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	recurrences,
	transactions,
} from "~/server/db/schema";

type AccountRow = typeof financialAccounts.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type GroupRow = typeof categoryGroups.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type RecurrenceRow = typeof recurrences.$inferSelect;

const frequencyOptions = {
	once: "Uma vez",
	weekly: "Semanal",
	monthly: "Mensal",
	yearly: "Anual",
};

export default async function ReceitasPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const today = isoToday();
	const monthStart = currentMonthStart(today);
	const monthEnd = currentMonthEnd(today);
	const receivableEnd = maxIso(monthEnd, addDaysIso(today, 30));
	const [
		allAccounts,
		allGroups,
		allCategories,
		incomeRecurrences,
		confirmedRows,
		incomeTransactions,
	] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, session.user.id))
			.orderBy(asc(financialAccounts.name)),
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
			.from(recurrences)
			.where(
				and(
					eq(recurrences.userId, session.user.id),
					eq(recurrences.movementType, "income"),
				),
			)
			.orderBy(asc(recurrences.isArchived), asc(recurrences.name)),
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
		db
			.select()
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, session.user.id),
					eq(transactions.movementType, "income"),
				),
			)
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
	]);

	const activeAccounts = allAccounts.filter(
		(account) =>
			!account.isArchived && account.isActive && account.type !== "credit_card",
	);
	const incomeGroups = allGroups.filter(
		(group) => !group.isArchived && group.kind === "income",
	);
	const incomeCategories = allCategories.filter(
		(category) => !category.isArchived && category.kind === "income",
	);
	const confirmed = confirmedRows.flatMap((row) =>
		row.recurrenceId && row.occurrenceOn
			? [{ recurrenceId: row.recurrenceId, occurrenceOn: row.occurrenceOn }]
			: [],
	);
	const confirmedSet = new Set(
		confirmed.map((row) => `${row.recurrenceId}:${row.occurrenceOn}`),
	);
	const activeRecurrences = incomeRecurrences.filter(
		(recurrence) => !recurrence.isArchived,
	);
	const receivable = [
		...lateRecurrences(activeRecurrences, confirmed, today),
		...activeRecurrences.flatMap((recurrence) =>
			generateOccurrences(recurrence, { start: today, end: receivableEnd })
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
		),
	].sort((left, right) => left.occurrenceOn.localeCompare(right.occurrenceOn));
	const received = incomeTransactions
		.filter(
			(transaction) =>
				!transaction.isArchived && transaction.status === "confirmed",
		)
		.filter(
			(transaction) =>
				transaction.occurredOn >= monthStart &&
				transaction.occurredOn <= monthEnd,
		);
	const accountById = new Map(
		allAccounts.map((account) => [account.id, account]),
	);
	const categoryById = new Map(
		allCategories.map((category) => [category.id, category]),
	);
	const groupById = new Map(allGroups.map((group) => [group.id, group]));
	const accountOptions = Object.fromEntries(
		activeAccounts.map((account) => [String(account.id), account.name]),
	);
	const categoryOptions = Object.fromEntries(
		incomeCategories.map((category) => [String(category.id), category.name]),
	);
	const receivableWithMatches = receivable.map((item) => ({
		...item,
		matchingTransaction: findMatchingUnlinkedIncome(
			item.recurrence,
			item.occurrenceOn,
			incomeTransactions,
		),
	}));
	const receivableTotal = receivable.reduce(
		(total, item) => total + item.recurrence.amountCents,
		0,
	);
	const receivedTotal = received.reduce(
		(total, item) => total + item.amountCents,
		0,
	);
	const receivedGroups = incomeGroups
		.map((group) => {
			const groupCategories = incomeCategories.filter(
				(category) => category.groupId === group.id,
			);
			const rows = groupCategories
				.map((category) => ({
					category,
					total: received
						.filter((transaction) => transaction.categoryId === category.id)
						.reduce((total, transaction) => total + transaction.amountCents, 0),
				}))
				.filter((row) => row.total > 0);
			return {
				group,
				rows,
				total: rows.reduce((total, row) => total + row.total, 0),
			};
		})
		.filter((group) => group.total > 0);
	const uncategorizedTotal = received
		.filter((transaction) => transaction.categoryId === null)
		.reduce((total, transaction) => total + transaction.amountCents, 0);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={
					<>
						<IncomeDialog
							accountOptions={accountOptions}
							categoryOptions={categoryOptions}
						/>
						<IncomeRecurrenceDialog
							accountOptions={accountOptions}
							categoryOptions={categoryOptions}
						/>
					</>
				}
				description="Acompanhe receitas previstas, confirme recebimentos recorrentes e lance receitas avulsas."
				eyebrow="Receitas"
				title="Receitas"
			/>

			<section className="grid gap-4 sm:grid-cols-3">
				<StatCard
					icon={CalendarClock}
					label="A receber"
					value={formatMoney(receivableTotal)}
				/>
				<StatCard
					icon={CheckCircle2}
					label="Recebidas no mês"
					tone="success"
					value={formatMoney(receivedTotal)}
				/>
				<StatCard
					label="Recorrentes ativas"
					value={String(activeRecurrences.length)}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Receitas recorrentes</CardTitle>
				</CardHeader>
				<CardContent>
					{activeRecurrences.length > 0 ? (
						<div className="grid gap-3">
							{activeRecurrences.map((recurrence) => (
								<RecurringIncomeRow
									accountOptions={accountOptions}
									categoryOptions={categoryOptions}
									key={recurrence.id}
									recurrence={recurrence}
								/>
							))}
						</div>
					) : (
						<EmptyState
							description="Nenhuma receita recorrente cadastrada."
							icon={CalendarClock}
							title="Sem recorrentes"
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>A receber</CardTitle>
				</CardHeader>
				<CardContent>
					{receivableWithMatches.length > 0 ? (
						<div className="grid gap-3">
							{receivableWithMatches.map(
								({ recurrence, occurrenceOn, matchingTransaction }) => (
									<ReceivableRow
										accountOptions={accountOptions}
										categoryOptions={categoryOptions}
										key={`${recurrence.id}-${occurrenceOn}`}
										matchingTransaction={matchingTransaction}
										occurrenceOn={occurrenceOn}
										recurrence={recurrence}
									/>
								),
							)}
						</div>
					) : (
						<EmptyState
							description="Nenhuma receita atrasada, do mês atual ou dos próximos 30 dias."
							icon={BanknoteArrowDown}
							title="Nada a receber"
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Resumo do mês por grupo e categoria</CardTitle>
				</CardHeader>
				<CardContent>
					{receivedGroups.length > 0 || uncategorizedTotal > 0 ? (
						<div className="grid gap-4">
							{receivedGroups.map(({ group, rows, total }) => (
								<div
									className="rounded-md border bg-muted/20 p-4"
									key={group.id}
								>
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="font-medium">{group.name}</p>
											<p className="text-muted-foreground text-xs">
												{group.cashFlowRole === "financial"
													? "Receita financeira"
													: "Receita principal/operacional"}
											</p>
										</div>
										<Money
											cents={total}
											className="font-semibold"
											sign="credit"
										/>
									</div>
									<div className="mt-3 grid gap-2">
										{rows.map(({ category, total }) => (
											<div
												className="flex items-center justify-between gap-3 text-sm"
												key={category.id}
											>
												<span className="text-muted-foreground">
													{category.name}
												</span>
												<Money cents={total} sign="credit" />
											</div>
										))}
									</div>
								</div>
							))}
							{uncategorizedTotal > 0 ? (
								<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-4">
									<p className="font-medium">Sem categoria</p>
									<Money
										cents={uncategorizedTotal}
										className="font-semibold"
										sign="credit"
									/>
								</div>
							) : null}
						</div>
					) : (
						<EmptyState
							description="Nenhuma receita recebida no mês atual."
							icon={CheckCircle2}
							title="Sem resumo"
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recebidas no mês</CardTitle>
				</CardHeader>
				<CardContent>
					{received.length > 0 ? (
						<div className="grid gap-3">
							{received.map((transaction) => (
								<ReceivedRow
									account={
										transaction.accountId
											? accountById.get(transaction.accountId)
											: undefined
									}
									category={
										transaction.categoryId
											? categoryById.get(transaction.categoryId)
											: undefined
									}
									group={
										transaction.categoryId
											? groupById.get(
													categoryById.get(transaction.categoryId)?.groupId ??
														0,
												)
											: undefined
									}
									key={transaction.id}
									transaction={transaction}
								/>
							))}
						</div>
					) : (
						<EmptyState
							description="Nenhuma receita recebida no mês atual."
							icon={CheckCircle2}
							title="Sem receitas recebidas"
						/>
					)}
				</CardContent>
			</Card>
		</AppShell>
	);
}

function ReceivableRow({
	recurrence,
	occurrenceOn,
	matchingTransaction,
	accountOptions,
	categoryOptions,
}: {
	recurrence: RecurrenceInput & Partial<Pick<RecurrenceRow, "description">>;
	occurrenceOn: string;
	matchingTransaction: TransactionRow | null;
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
}) {
	const late = occurrenceOn < isoToday();
	return (
		<div className="grid gap-3 rounded-md border bg-muted/20 p-4 md:grid-cols-[1fr_auto] md:items-end">
			<form action={confirmRecurrenceOccurrence} className="contents">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{recurrence.name}</p>
						<Badge variant={late ? "destructive" : "secondary"}>
							{late ? "Atrasada" : "Prevista"}
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
					<div className="mt-3 grid gap-3 md:grid-cols-3">
						<Input defaultValue={recurrence.name} name="description" />
						<Input defaultValue={occurrenceOn} name="occurredOn" type="date" />
						<Input
							defaultValue={moneyValue(recurrence.amountCents)}
							name="amount"
						/>
					</div>
				</div>
				<div className="grid gap-2">
					<SubmitButton pendingLabel="Confirmando...">
						Confirmar recebimento
					</SubmitButton>
					{matchingTransaction ? (
						<div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-warning text-xs">
							<p>
								Já existe uma receita parecida lançada em{" "}
								{formatDate(matchingTransaction.occurredOn)} no valor de{" "}
								{formatMoney(matchingTransaction.amountCents)}.
							</p>
							<button
								className="mt-2 underline"
								formAction={linkTransactionToRecurrence}
								type="submit"
							>
								Vincular como recebida
							</button>
							<input
								name="transactionId"
								type="hidden"
								value={matchingTransaction.id}
							/>
						</div>
					) : null}
				</div>
			</form>
			<div className="md:col-start-2">
				<IncomeRecurrenceDialog
					accountOptions={accountOptions}
					categoryOptions={categoryOptions}
					recurrence={recurrence}
				/>
			</div>
		</div>
	);
}

function RecurringIncomeRow({
	recurrence,
	accountOptions,
	categoryOptions,
}: {
	recurrence: RecurrenceRow;
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="font-medium">{recurrence.name}</p>
				<p className="text-muted-foreground text-xs">
					{formatMoney(recurrence.amountCents)} · {frequencyLabel(recurrence)} ·
					início em {formatDate(recurrence.startsOn)}
				</p>
			</div>
			<IncomeRecurrenceDialog
				accountOptions={accountOptions}
				categoryOptions={categoryOptions}
				recurrence={recurrence}
			/>
		</div>
	);
}

function ReceivedRow({
	transaction,
	account,
	category,
	group,
}: {
	transaction: TransactionRow;
	account?: AccountRow;
	category?: CategoryRow;
	group?: GroupRow;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="font-medium">{transaction.description}</p>
				<p className="text-muted-foreground text-xs">
					{formatDate(transaction.occurredOn)} ·{" "}
					{account?.name ?? "Conta removida"} ·{" "}
					{group?.name ?? "Grupo removido"} ·{" "}
					{category?.name ?? "Sem categoria"}
				</p>
			</div>
			<Money
				cents={transaction.amountCents}
				className="font-semibold"
				sign="credit"
			/>
		</div>
	);
}

function IncomeDialog({
	accountOptions,
	categoryOptions,
}: {
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
}) {
	return (
		<ActionDialog
			action={createTransaction}
			contentClassName="sm:max-w-2xl"
			formClassName="grid gap-4 sm:grid-cols-2"
			pendingLabel="Lançando..."
			submitLabel="Lançar"
			successMessage="Receita lançada."
			title="Receita recebida"
			trigger={
				<Button>
					<Plus className="size-4" />
					Receita recebida
				</Button>
			}
		>
			<input name="movementType" type="hidden" value="income" />
			<input name="status" type="hidden" value="confirmed" />
			<Field
				defaultValue={isoToday()}
				label="Data"
				name="occurredOn"
				type="date"
			/>
			<Field label="Descrição" name="description" />
			<Field label="Valor" name="amount" />
			<SelectField label="Conta" name="accountId" options={accountOptions} />
			<SelectField
				label="Categoria"
				name="categoryId"
				options={categoryOptions}
			/>
			<Field label="Observações" name="notes" />
		</ActionDialog>
	);
}

function IncomeRecurrenceDialog({
	accountOptions,
	categoryOptions,
	recurrence,
}: {
	accountOptions: Record<string, string>;
	categoryOptions: Record<string, string>;
	recurrence?: RecurrenceInput & Partial<Pick<RecurrenceRow, "description">>;
}) {
	return (
		<ActionDialog
			action={recurrence ? updateRecurrence : createRecurrence}
			contentClassName="sm:max-w-3xl"
			description="Use para salário, aluguéis e outras receitas esperadas. Depois confirme cada recebimento em A receber."
			footerClassName="sm:col-span-2 lg:col-span-3"
			formClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
			pendingLabel={recurrence ? "Salvando..." : "Cadastrando..."}
			submitLabel={recurrence ? "Salvar" : "Cadastrar"}
			successMessage={
				recurrence
					? "Receita recorrente atualizada."
					: "Receita recorrente criada."
			}
			title={recurrence ? "Editar receita recorrente" : "Receita recorrente"}
			trigger={
				<Button size={recurrence ? "sm" : "default"} variant="outline">
					{recurrence ? (
						"Editar recorrente"
					) : (
						<>
							<Plus className="size-4" />
							Receita recorrente
						</>
					)}
				</Button>
			}
		>
			{recurrence ? (
				<input name="id" type="hidden" value={recurrence.id} />
			) : null}
			<input name="movementType" type="hidden" value="income" />
			<Field defaultValue={recurrence?.name} label="Nome" name="name" />
			<Field
				defaultValue={
					recurrence ? moneyValue(recurrence.amountCents) : undefined
				}
				label="Valor"
				name="amount"
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
					recurrence?.categoryId ? String(recurrence.categoryId) : undefined
				}
				label="Categoria"
				name="categoryId"
				options={categoryOptions}
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
			<Field
				defaultValue={recurrence?.description ?? ""}
				label="Descrição"
				name="description"
			/>
		</ActionDialog>
	);
}

function Field({
	label,
	name,
	...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`income-${name}`}>{label}</Label>
			<Input id={`income-${name}`} name={name} {...props} />
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
			<Label htmlFor={`income-${name}`}>{label}</Label>
			<select
				className={selectClass}
				defaultValue={defaultValue}
				id={`income-${name}`}
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

function isoToday() {
	return new Date().toISOString().slice(0, 10);
}

function currentMonthStart(dateIso: string) {
	return `${dateIso.slice(0, 7)}-01`;
}

function currentMonthEnd(dateIso: string) {
	const date = new Date(`${dateIso.slice(0, 7)}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + 1, 0);
	return date.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number) {
	const date = new Date(`${dateIso}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function maxIso(left: string, right: string) {
	return left > right ? left : right;
}

function frequencyLabel(
	recurrence: Pick<RecurrenceRow, "frequency" | "intervalCount">,
) {
	const interval = recurrence.intervalCount > 1 ? recurrence.intervalCount : 1;
	if (recurrence.frequency === "once") return "Uma vez";
	if (recurrence.frequency === "weekly") {
		return interval === 1 ? "Semanal" : `A cada ${interval} semanas`;
	}
	if (recurrence.frequency === "monthly") {
		return interval === 1 ? "Mensal" : `A cada ${interval} meses`;
	}
	return interval === 1 ? "Anual" : `A cada ${interval} anos`;
}

function findMatchingUnlinkedIncome(
	recurrence: RecurrenceInput,
	occurrenceOn: string,
	transactions: TransactionRow[],
) {
	return (
		transactions
			.filter(
				(transaction) =>
					!transaction.isArchived &&
					transaction.status === "confirmed" &&
					transaction.movementType === "income" &&
					transaction.recurrenceId === null &&
					transaction.accountId === recurrence.accountId &&
					(recurrence.categoryId === null ||
						transaction.categoryId === recurrence.categoryId),
			)
			.map((transaction) => ({
				transaction,
				dayDelta: Math.abs(daysBetween(transaction.occurredOn, occurrenceOn)),
				valueDelta: Math.abs(transaction.amountCents - recurrence.amountCents),
			}))
			.filter(
				(candidate) =>
					candidate.dayDelta <= 3 &&
					candidate.valueDelta <=
						Math.max(100, Math.round(recurrence.amountCents * 0.05)),
			)
			.sort(
				(left, right) =>
					left.dayDelta - right.dayDelta || left.valueDelta - right.valueDelta,
			)[0]?.transaction ?? null
	);
}

function daysBetween(left: string, right: string) {
	const leftDate = new Date(`${left}T00:00:00Z`);
	const rightDate = new Date(`${right}T00:00:00Z`);
	return Math.round((rightDate.valueOf() - leftDate.valueOf()) / 86_400_000);
}

function moneyValue(cents: number) {
	return formatMoneyInput(cents);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
