import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { createAccount } from "~/app/_actions/finance-actions";
import {
	FinanceShell,
	Panel,
	Select,
	SubmitButton,
	TextInput,
} from "~/app/_components/finance-ui";
import { AccountsList } from "~/app/accounts/accounts-client";
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
		<FinanceShell
			description="Cadastre contas bancárias, carteiras e cartões. Cartão de crédito é conta; pagamento de fatura é transferência."
			eyebrow="Contas"
			title="Contas e cartões"
		>
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-4">
					<p className="text-[color:var(--color-text-muted)] text-sm">
						Saldo consolidado sem cartões
					</p>
					<p className="mt-2 font-semibold text-2xl">
						{formatMoney(normalConsolidated)}
					</p>
				</div>
				<div className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-4">
					<p className="text-[color:var(--color-text-muted)] text-sm">
						Dívida aberta em cartões
					</p>
					<p className="mt-2 font-semibold text-2xl text-[color:var(--color-bad)]">
						{formatMoney(cardDebt)}
					</p>
				</div>
			</section>

			<Panel title="Nova conta">
				<form
					action={createAccount}
					className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-3"
				>
					<TextInput name="name" placeholder="Nome" />
					<TextInput name="institution" placeholder="Instituição" />
					<Select name="type" options={accountTypeLabels} />
					<TextInput
						defaultValue="0,00"
						name="initialBalance"
						placeholder="Saldo inicial"
					/>
					<TextInput name="closingDay" placeholder="Fechamento (cartão)" />
					<TextInput name="dueDay" placeholder="Vencimento (cartão)" />
					<SubmitButton pendingLabel="Cadastrando...">
						Cadastrar conta
					</SubmitButton>
				</form>
			</Panel>

			<Panel title="Contas cadastradas">
				<AccountsList
					accounts={activeAccounts}
					balances={Object.fromEntries(balances)}
				/>
			</Panel>

			<Panel title="Faturas dinâmicas de cartão">
				<div className="grid gap-4 sm:grid-cols-2">
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
									className="rounded-2xl border border-[color:var(--color-border-subtle)] p-4"
									key={card.id}
								>
									<h3 className="font-medium">{card.name}</h3>
									<p className="text-[color:var(--color-text-muted)] text-sm">
										Dívida aberta:{" "}
										{formatMoney(balances.get(card.id)?.cardDebtCents ?? 0)}
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
			</Panel>
		</FinanceShell>
	);
}
