import { asc, desc, eq } from "drizzle-orm";
import { Archive, CalendarCheck, CalendarPlus, CreditCard, Plus } from "lucide-react";
import { redirect } from "next/navigation";

import {
	archiveCard,
	createCard,
	createCardPurchase,
	payCardInvoice,
	updateCard,
} from "~/app/_actions/finance-actions";
import {
	addCardToImportRoutine,
	removeCardFromImportRoutine,
} from "~/app/_actions/import-routine-actions";
import { ActionDialog } from "~/components/action-dialog";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
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
import { formatDate, formatMoney, formatMoneyInput } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	cardInvoices,
	categories,
	creditCards,
	financialAccounts,
	importRoutineItems,
	transactions,
} from "~/server/db/schema";

const inputClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass = inputClass;

type CardInvoiceRow = typeof cardInvoices.$inferSelect;
type CardTransactionRow = typeof transactions.$inferSelect;

export default async function CardsPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const [cards, invoices, rows, accounts, expenseCategories, routineItems] =
		await Promise.all([
			db
				.select()
				.from(creditCards)
				.where(eq(creditCards.userId, session.user.id))
				.orderBy(asc(creditCards.name)),
			db
				.select()
				.from(cardInvoices)
				.where(eq(cardInvoices.userId, session.user.id))
				.orderBy(desc(cardInvoices.dueDate)),
			db
				.select()
				.from(transactions)
				.where(eq(transactions.userId, session.user.id))
				.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, session.user.id))
				.orderBy(asc(financialAccounts.name)),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, session.user.id))
				.orderBy(asc(categories.name)),
			db
				.select({ cardId: importRoutineItems.cardId })
				.from(importRoutineItems)
				.where(eq(importRoutineItems.userId, session.user.id)),
		]);
	const routineCardIds = new Set(
		routineItems
			.map((item) => item.cardId)
			.filter((id): id is number => id !== null),
	);
	const activeCards = cards.filter((card) => !card.isArchived);
	const usableAccounts = accounts.filter(
		(account) =>
			!account.isArchived && account.isActive && account.type !== "credit_card",
	);
	const usableExpenseCategories = expenseCategories.filter(
		(category) => !category.isArchived && category.kind === "expense",
	);
	const rowsByInvoice = new Map<number, CardTransactionRow[]>();
	for (const row of rows) {
		if (!row.cardInvoiceId || row.isArchived) continue;
		const saved = rowsByInvoice.get(row.cardInvoiceId) ?? [];
		saved.push(row);
		rowsByInvoice.set(row.cardInvoiceId, saved);
	}
	const invoiceSummaries = invoices.map((invoice) =>
		summarizeInvoice(invoice, rowsByInvoice.get(invoice.id) ?? []),
	);
	const debtCents = invoiceSummaries.reduce(
		(total, invoice) => total + invoice.remainingCents,
		0,
	);
	const nextDue = invoiceSummaries
		.filter((invoice) => invoice.remainingCents > 0)
		.sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={<CreateCardDialog accounts={usableAccounts} />}
				description="Gerencie cartões, faturas e pagamentos. Adicione cada cartão à rotina mensal para lembrar de importar a fatura no dia 1."
				eyebrow="Cartões"
				title="Cartões de crédito"
			/>

			<section className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={CreditCard}
					label="Dívida aberta em cartões"
					tone={debtCents > 0 ? "destructive" : "default"}
					value={formatMoney(debtCents)}
				/>
				<StatCard
					icon={CreditCard}
					label="Próxima fatura"
					value={
						nextDue
							? `${formatDate(nextDue.dueDate)} · ${formatMoney(nextDue.remainingCents)}`
							: "Sem faturas abertas"
					}
				/>
			</section>

			<div className="grid gap-6">
				{activeCards.map((card) => {
					const cardInvoicesList = invoiceSummaries.filter(
						(invoice) => invoice.cardId === card.id,
					);
					const inRoutine = routineCardIds.has(card.id);
					return (
						<Card key={card.id}>
							<CardHeader>
								<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<CardTitle>{card.name}</CardTitle>
											{inRoutine ? (
												<Badge variant="default">Na rotina</Badge>
											) : null}
										</div>
										<CardDescription>
											{card.institution ?? "Sem instituição"} · fecha dia{" "}
											{card.closingDay} · vence dia {card.dueDay}
											{card.limitCents
												? ` · limite ${formatMoney(card.limitCents)}`
												: ""}
										</CardDescription>
									</div>
									<div className="flex flex-wrap gap-2">
										{inRoutine ? (
											<form action={removeCardFromImportRoutine}>
												<input name="cardId" type="hidden" value={card.id} />
												<SubmitButton
													pendingLabel="Removendo..."
													size="sm"
													variant="outline"
												>
													<CalendarCheck className="size-4" />
													Remover da rotina
												</SubmitButton>
											</form>
										) : (
											<form action={addCardToImportRoutine}>
												<input name="cardId" type="hidden" value={card.id} />
												<SubmitButton
													pendingLabel="Adicionando..."
													size="sm"
													variant="outline"
												>
													<CalendarPlus className="size-4" />
													Adicionar à rotina
												</SubmitButton>
											</form>
										)}
										<CreatePurchaseDialog
											cardId={card.id}
											categories={usableExpenseCategories}
										/>
										<EditCardDialog accounts={usableAccounts} card={card} />
										<form action={archiveCard}>
											<input name="id" type="hidden" value={card.id} />
											<SubmitButton
												pendingLabel="Arquivando..."
												variant="destructive"
											>
												<Archive className="size-4" />
												Arquivar
											</SubmitButton>
										</form>
									</div>
								</div>
							</CardHeader>
							<CardContent className="grid gap-4">
								{cardInvoicesList.length === 0 ? (
									<EmptyState
										description="Cadastre uma compra ou importe um CSV para criar a primeira fatura."
										icon={CreditCard}
										title="Sem faturas"
									/>
								) : null}
								{cardInvoicesList.map((invoice) => (
									<div
										className="rounded-md border bg-muted/10 p-4"
										key={invoice.id}
									>
										<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<h3 className="font-medium">
														Fatura {invoice.monthKey}
													</h3>
													<Badge
														variant={
															invoice.remainingCents > 0
																? "secondary"
																: "outline"
														}
													>
														{invoice.remainingCents > 0 ? "aberta" : "paga"}
													</Badge>
													{invoice.needsReview ? (
														<Badge variant="destructive">revisar</Badge>
													) : null}
												</div>
												<p className="text-muted-foreground text-sm">
													Fecha {formatDate(invoice.closingDate)} · vence{" "}
													{formatDate(invoice.dueDate)}
												</p>
												<p className="mt-1 text-sm">
													Total{" "}
													<Money cents={invoice.totalCents} sign="debit" /> ·
													Pago <Money cents={invoice.paidCents} /> · Aberto{" "}
													<Money cents={invoice.remainingCents} sign="debit" />
												</p>
											</div>
											<PayInvoiceDialog
												accounts={usableAccounts}
												defaultAccountId={card.defaultPaymentAccountId}
												invoiceId={invoice.id}
												remainingCents={invoice.remainingCents}
											/>
										</div>
										<div className="mt-4 grid gap-2 text-sm">
											{invoice.rows.slice(0, 8).map((row) => (
												<div
													className="flex justify-between gap-3"
													key={row.id}
												>
													<span className="min-w-0 truncate">
														{formatDate(row.occurredOn)} · {row.description}
													</span>
													<Money
														cents={row.amountCents}
														sign={
															row.cardEntryKind === "credit"
																? "credit"
																: "debit"
														}
													/>
												</div>
											))}
											{invoice.rows.length > 8 ? (
												<p className="text-muted-foreground text-xs">
													+ {invoice.rows.length - 8} lançamento(s)
												</p>
											) : null}
										</div>
									</div>
								))}
							</CardContent>
						</Card>
					);
				})}
				{activeCards.length === 0 ? (
					<EmptyState
						description="Cadastre um cartão e adicione-o à rotina mensal para lembrar de importar a fatura todo dia 1."
						icon={CreditCard}
						title="Sem cartões"
					/>
				) : null}
			</div>
		</AppShell>
	);
}

function summarizeInvoice(invoice: CardInvoiceRow, rows: CardTransactionRow[]) {
	let totalCents = 0;
	let paidCents = 0;
	for (const row of rows) {
		if (row.status !== "confirmed") continue;
		if (row.movementType === "credit_card_payment") {
			paidCents += row.amountCents;
			continue;
		}
		if (row.cardEntryKind === "credit") totalCents -= row.amountCents;
		else totalCents += row.amountCents;
	}
	return {
		...invoice,
		rows,
		totalCents,
		paidCents,
		remainingCents: Math.max(0, totalCents - paidCents),
	};
}

function CreateCardDialog({
	accounts,
}: {
	accounts: { id: number; name: string }[];
}) {
	return (
		<ActionDialog
			action={createCard}
			description="Cartão não é conta: ele cria faturas e as faturas são pagas por contas."
			formClassName="grid gap-4"
			pendingLabel="Cadastrando..."
			submitLabel="Cadastrar cartão"
			successMessage="Cartão criado."
			title="Novo cartão"
			trigger={
				<Button>
					<Plus className="size-4" />
					Novo cartão
				</Button>
			}
		>
			<CardFields accounts={accounts} />
		</ActionDialog>
	);
}

function EditCardDialog({
	accounts,
	card,
}: {
	accounts: { id: number; name: string }[];
	card: typeof creditCards.$inferSelect;
}) {
	return (
		<ActionDialog
			action={updateCard}
			formClassName="grid gap-4"
			pendingLabel="Salvando..."
			submitLabel="Salvar cartão"
			successMessage="Cartão atualizado."
			title="Editar cartão"
			trigger={<Button variant="outline">Editar</Button>}
		>
			<input name="id" type="hidden" value={card.id} />
			<CardFields accounts={accounts} card={card} />
			<label className="flex items-center gap-2 text-sm">
				<input defaultChecked={card.isActive} name="isActive" type="checkbox" />
				Ativo
			</label>
		</ActionDialog>
	);
}

function CardFields({
	accounts,
	card,
}: {
	accounts: { id: number; name: string }[];
	card?: typeof creditCards.$inferSelect;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<Field defaultValue={card?.name ?? ""} label="Nome" name="name" />
			<Field
				defaultValue={card?.institution ?? ""}
				label="Instituição"
				name="institution"
			/>
			<Field
				defaultValue={card?.closingDay?.toString() ?? ""}
				label="Dia de fechamento"
				name="closingDay"
				type="number"
			/>
			<Field
				defaultValue={card?.dueDay?.toString() ?? ""}
				label="Dia de vencimento"
				name="dueDay"
				type="number"
			/>
			<Field
				defaultValue={card?.limitCents ? formatMoneyInput(card.limitCents) : ""}
				label="Limite opcional"
				name="limit"
			/>
			<div className="grid gap-2">
				<Label>Conta padrão para pagamento</Label>
				<select
					className={selectClass}
					defaultValue={card?.defaultPaymentAccountId ?? ""}
					name="defaultPaymentAccountId"
				>
					<option value="">Sem padrão</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function CreatePurchaseDialog({
	cardId,
	categories,
}: {
	cardId: number;
	categories: { id: number; name: string }[];
}) {
	const currentMonth = new Date().toISOString().slice(0, 7);
	return (
		<ActionDialog
			action={createCardPurchase}
			contentClassName="max-w-3xl"
			description="Informe a fatura pelo mês de vencimento. Se ela já existir, a compra entra nela."
			formClassName="grid gap-4"
			pendingLabel="Lançando..."
			submitLabel="Lançar compra"
			successMessage="Compra criada."
			title="Compra no cartão"
			trigger={<Button>Compra</Button>}
		>
			<input name="cardId" type="hidden" value={cardId} />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Field label="Data da compra" name="occurredOn" type="date" />
				<Field
					defaultValue={currentMonth}
					label="Mês da fatura"
					name="invoiceMonthKey"
					type="month"
				/>
				<Field label="Descrição" name="description" />
				<Field label="Descrição original" name="originalDescription" />
				<Field label="Valor total" name="amount" />
				<Field
					defaultValue="1"
					label="Parcelas"
					name="installmentCount"
					type="number"
				/>
				<div className="grid gap-2">
					<Label>Categoria</Label>
					<select className={selectClass} name="categoryId" required>
						<option value="">Escolha</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</div>
				<Field label="Notas" name="notes" />
			</div>
		</ActionDialog>
	);
}

function PayInvoiceDialog({
	accounts,
	defaultAccountId,
	invoiceId,
	remainingCents,
}: {
	accounts: { id: number; name: string }[];
	defaultAccountId: number | null;
	invoiceId: number;
	remainingCents: number;
}) {
	return (
		<ActionDialog
			action={payCardInvoice}
			description="Pagamento sai de uma conta real e abate esta fatura. Pagamento acima do saldo é permitido."
			formClassName="grid gap-4"
			pendingLabel="Pagando..."
			submitLabel="Registrar pagamento"
			successMessage="Pagamento registrado."
			title="Pagar fatura"
			trigger={<Button variant="outline">Pagar</Button>}
		>
			<input name="movementType" type="hidden" value="credit_card_payment" />
			<input name="status" type="hidden" value="confirmed" />
			<input name="cardInvoiceId" type="hidden" value={invoiceId} />
			<input name="description" type="hidden" value="Pagamento de fatura" />
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Data" name="occurredOn" type="date" />
				<Field
					defaultValue={remainingCents ? formatMoneyInput(remainingCents) : ""}
					label="Valor"
					name="amount"
				/>
				<div className="grid gap-2">
					<Label>Conta origem</Label>
					<select
						className={selectClass}
						defaultValue={defaultAccountId ?? ""}
						name="accountId"
						required
					>
						<option value="">Escolha</option>
						{accounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
				</div>
				<Field label="Notas" name="notes" />
			</div>
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
			<Label htmlFor={`card-${name}`}>{label}</Label>
			<Input
				className={inputClass}
				id={`card-${name}`}
				name={name}
				{...props}
			/>
		</div>
	);
}
