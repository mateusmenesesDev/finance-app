"use client";

import { Archive, Pencil, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { archiveAccount, updateAccount } from "~/app/_actions/finance-actions";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { formatMoneyInput } from "~/lib/formatters";

const accountTypeLabels = {
	checking: "Conta corrente",
	savings: "Poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

type Account = {
	id: number;
	name: string;
	institution: string | null;
	type: keyof typeof accountTypeLabels;
	initialBalanceCents: number;
	creditCardClosingDay: number | null;
	creditCardDueDay: number | null;
	isActive: boolean;
};

type AccountBalance = {
	normalBalanceCents: number;
	cardDebtCents: number;
};

export function AccountsList({
	accounts,
	balances,
}: {
	accounts: Account[];
	balances: Record<number, AccountBalance>;
}) {
	const [visibleAccounts, setVisibleAccounts] = useState(accounts);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setVisibleAccounts(accounts);
	}, [accounts]);

	async function archiveWithRollback(formData: FormData) {
		const id = Number(formData.get("id"));
		const before = visibleAccounts;
		setError(null);
		setStatus("Arquivando conta...");
		setVisibleAccounts((current) =>
			current.filter((account) => account.id !== id),
		);
		try {
			await archiveAccount(formData);
			setStatus("Conta arquivada.");
		} catch {
			setVisibleAccounts(before);
			setError("Não foi possível arquivar a conta.");
			setStatus(null);
		}
	}

	return (
		<div className="grid gap-3">
			<p aria-live="polite" className="sr-only" role="status">
				{status ?? ""}
			</p>
			{error ? (
				<p
					aria-live="polite"
					className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{visibleAccounts.map((account) => {
				const balance = balances[account.id];
				return (
					<div
						className="flex flex-col gap-4 rounded-md border bg-muted/10 p-4 lg:flex-row lg:items-center lg:justify-between"
						key={account.id}
					>
						<div className="min-w-0 space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<p className="font-medium">{account.name}</p>
								<Badge variant="secondary">
									{accountTypeLabels[account.type]}
								</Badge>
								{account.isActive ? (
									<Badge variant="outline">Ativa</Badge>
								) : null}
							</div>
							<p className="text-muted-foreground text-sm">
								{account.institution ?? "Sem instituição"}
							</p>
							<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
								<span>
									Saldo: <Money cents={balance?.normalBalanceCents ?? 0} />
								</span>
								<span>
									Cartão:{" "}
									<Money cents={balance?.cardDebtCents ?? 0} sign="debit" />
								</span>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<EditAccountDialog account={account} />
							<ConfirmDialog
								action={archiveWithRollback}
								confirmLabel="Arquivar"
								description="Arquivar preserva o histórico da conta e remove ela das listas ativas."
								destructive
								hidden={{ id: account.id }}
								title="Arquivar conta?"
								trigger={
									<Button size="sm" variant="destructive">
										<Archive className="size-4" />
										Arquivar
									</Button>
								}
							/>
						</div>
					</div>
				);
			})}
			{visibleAccounts.length === 0 ? (
				<EmptyState
					description="Nenhuma conta cadastrada."
					icon={Wallet}
					title="Sem contas"
				/>
			) : null}
		</div>
	);
}

function EditAccountDialog({ account }: { account: Account }) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Pencil className="size-4" />
					Editar
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar conta</DialogTitle>
					<DialogDescription>
						Atualize dados da conta ou cartão.
					</DialogDescription>
				</DialogHeader>
				<form action={updateAccount} className="grid gap-4">
					<input name="id" type="hidden" value={account.id} />
					<div className="grid gap-4 sm:grid-cols-2">
						<Field defaultValue={account.name} label="Nome" name="name" />
						<Field
							defaultValue={account.institution ?? ""}
							label="Instituição"
							name="institution"
						/>
						<div className="grid gap-2">
							<Label htmlFor={`account-${account.id}-type`}>Tipo</Label>
							<select
								className={selectClass}
								defaultValue={account.type}
								id={`account-${account.id}-type`}
								name="type"
							>
								{Object.entries(accountTypeLabels).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<Field
							defaultValue={formatMoneyInput(account.initialBalanceCents)}
							label="Saldo inicial"
							name="initialBalance"
						/>
						<Field
							defaultValue={account.creditCardClosingDay?.toString() ?? ""}
							label="Fecha"
							name="closingDay"
						/>
						<Field
							defaultValue={account.creditCardDueDay?.toString() ?? ""}
							label="Vence"
							name="dueDay"
						/>
					</div>
					<div className="flex items-center gap-2 text-sm">
						<Checkbox
							defaultChecked={account.isActive}
							id={`account-${account.id}-active`}
							name="isActive"
						/>
						<Label htmlFor={`account-${account.id}-active`}>Ativa</Label>
					</div>
					<DialogFooter>
						<SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
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
