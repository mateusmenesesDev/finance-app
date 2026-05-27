import { asc, eq } from "drizzle-orm";
import { Plus, Wallet } from "lucide-react";
import { redirect } from "next/navigation";

import { createAccount } from "~/app/_actions/finance-actions";
import { AccountsList } from "~/app/accounts/accounts-client";
import { ActionDialog } from "~/components/action-dialog";
import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { StatCard } from "~/components/stat-card";
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
import { calculateAccountBalances } from "~/lib/finance-rules";
import { formatMoney } from "~/lib/formatters";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { financialAccounts, transactions } from "~/server/db/schema";

const accountTypeLabels = {
	checking: "Conta corrente",
	savings: "Poupança",
	cash: "Carteira",
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
			.where(eq(transactions.userId, session.user.id)),
	]);
	const activeAccounts = allAccounts.filter(
		(account) => !account.isArchived && account.type !== "credit_card",
	);
	const balances = calculateAccountBalances(allAccounts, allTransactions);
	const normalConsolidated = activeAccounts.reduce(
		(total, account) =>
			total + (balances.get(account.id)?.normalBalanceCents ?? 0),
		0,
	);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				actions={<CreateAccountDialog />}
				description="Cadastre apenas contas que guardam dinheiro real. Cartões ficam em uma tela própria."
				eyebrow="Contas"
				title="Contas"
			/>

			<section className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={Wallet}
					label="Saldo consolidado"
					value={formatMoney(normalConsolidated)}
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
		</AppShell>
	);
}

function CreateAccountDialog() {
	return (
		<ActionDialog
			action={createAccount}
			description="Cadastre uma conta bancária, carteira ou investimento."
			formClassName="grid gap-4"
			pendingLabel="Cadastrando..."
			submitLabel="Cadastrar conta"
			successMessage="Conta criada."
			title="Nova conta"
			trigger={
				<Button>
					<Plus className="size-4" />
					Nova conta
				</Button>
			}
		>
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
				<Field defaultValue="0" label="Saldo inicial" name="initialBalance" />
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
			<Label htmlFor={`field-${name}`}>{label}</Label>
			<Input id={`field-${name}`} name={name} {...props} />
		</div>
	);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
