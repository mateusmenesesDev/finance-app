import { asc, desc, eq } from "drizzle-orm";
import { CreditCard, Plus, Wallet } from "lucide-react";
import { redirect } from "next/navigation";

import { createAccount } from "~/app/_actions/finance-actions";
import { AccountsList } from "~/app/accounts/accounts-client";
import { AppShell } from "~/components/app-shell";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
import { SubmitButton } from "~/components/submit-button";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	calculateAccountBalances,
	getInvoiceForDate,
} from "~/lib/finance-rules";
import { formatDate, formatMoney } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { financialAccounts, transactions } from "~/server/db/schema";

const accountTypeLabels = {
	checking: "Conta corrente",
	savings: "Poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

export default async function AccountsPage() {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const [allAccounts, allTransactions] = await Promise.all([
		db
			.select()
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, session.user.id))
			.orderBy(asc(financialAccounts.name)),
		db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, session.user.id))
			.orderBy(desc(transactions.occurredOn), desc(transactions.id)),
	]);
	const activeAccounts = allAccounts.filter((account) => !account.isArchived);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const normalConsolidated = activeAccounts.reduce(
		(total, account) =>
			total + (balances.get(account.id)?.normalBalanceCents ?? 0),
		0,
	);
	const cardDebt = activeAccounts.reduce(
		(total, account) => total + (balances.get(account.id)?.cardDebtCents ?? 0),
		0,
	);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={<CreateAccountDialog />}
				description="Cadastre contas bancárias, carteiras e cartões. Cartão de crédito é conta; pagamento de fatura é transferência."
				eyebrow="Contas"
				title="Contas e cartões"
			/>

			<section className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={Wallet}
					label="Saldo consolidado sem cartões"
					value={formatMoney(normalConsolidated)}
				/>
				<StatCard
					icon={CreditCard}
					label="Dívida aberta em cartões"
					tone={cardDebt > 0 ? "destructive" : "default"}
					value={formatMoney(cardDebt)}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Contas cadastradas</CardTitle>
					<CardDescription>
						Saldos atuais, tipo e instituição de cada conta ativa.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AccountsList
						accounts={activeAccounts}
						balances={Object.fromEntries(balances)}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Faturas dinâmicas de cartão</CardTitle>
					<CardDescription>
						Estimadas a partir das compras confirmadas no cartão.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 sm:grid-cols-2">
						{activeAccounts.filter((account) => account.type === "credit_card")
							.length === 0 ? (
							<EmptyState
								description="Cadastre um cartão para acompanhar faturas."
								icon={CreditCard}
								title="Sem cartões ativos"
							/>
						) : null}
						{activeAccounts
							.filter((account) => account.type === "credit_card")
							.map((card) => {
								const invoices = new Map<
									string,
									{ closingDate: string; dueDate: string; total: number }
								>();
								for (const transaction of allTransactions) {
									if (
										!transaction.isArchived &&
										transaction.status === "confirmed" &&
										transaction.accountId === card.id &&
										transaction.movementType === "expense"
									) {
										const invoice = getInvoiceForDate(
											transaction.occurredOn,
											card.creditCardClosingDay ?? 31,
											card.creditCardDueDay ?? 10,
										);
										const saved = invoices.get(invoice.key) ?? {
											...invoice,
											total: 0,
										};
										saved.total += transaction.amountCents;
										invoices.set(invoice.key, saved);
									}
								}
								return (
									<div
										className="rounded-md border bg-muted/20 p-4"
										key={card.id}
									>
										<h3 className="font-medium">{card.name}</h3>
										<p className="text-muted-foreground text-sm">
											Dívida aberta:{" "}
											<Money
												cents={balances.get(card.id)?.cardDebtCents ?? 0}
												sign="debit"
											/>
										</p>
										{Array.from(invoices.entries()).map(([key, invoice]) => (
											<p className="mt-2 text-sm" key={key}>
												{key}: {formatMoney(invoice.total)} · fecha{" "}
												{formatDate(invoice.closingDate)} · vence{" "}
												{formatDate(invoice.dueDate)}
											</p>
										))}
									</div>
								);
							})}
					</div>
				</CardContent>
			</Card>
		</AppShell>
	);
}

function CreateAccountDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<Plus className="size-4" />
					Nova conta
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Nova conta</DialogTitle>
					<DialogDescription>
						Cadastre uma conta bancária, carteira ou cartão.
					</DialogDescription>
				</DialogHeader>
				<form action={createAccount} className="grid gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Nome" name="name" />
						<Field label="Instituição" name="institution" />
						<div className="grid gap-2">
							<Label htmlFor="account-type">Tipo</Label>
							<select className={selectClass} id="account-type" name="type">
								{Object.entries(accountTypeLabels).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<Field
							defaultValue="0,00"
							label="Saldo inicial"
							name="initialBalance"
						/>
						<Field label="Fechamento (cartão)" name="closingDay" />
						<Field label="Vencimento (cartão)" name="dueDay" />
					</div>
					<DialogFooter>
						<SubmitButton pendingLabel="Cadastrando...">
							Cadastrar conta
						</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	name,
	...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`account-${name}`}>{label}</Label>
			<Input id={`account-${name}`} name={name} {...props} />
		</div>
	);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
