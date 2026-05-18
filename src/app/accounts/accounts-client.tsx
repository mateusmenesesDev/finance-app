"use client";

import { useEffect, useState } from "react";

import { archiveAccount, updateAccount } from "~/app/_actions/finance-actions";
import {
	DangerSubmitButton,
	SubmitButton,
} from "~/app/_components/pending-submit-button";
import { formatMoney, formatMoneyInput } from "~/lib/formatters";

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

const accountTypeLabels = {
	checking: "Conta corrente",
	savings: "Poupança",
	cash: "Carteira",
	credit_card: "Cartão de crédito",
	investment: "Investimento",
};

const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-[color:var(--color-text)] text-sm";

function TextInput({
	className,
	...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={[inputClass, className].filter(Boolean).join(" ")}
			{...props}
		/>
	);
}

function Select({
	options,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
	options: Record<string, string>;
}) {
	return (
		<select {...props} className={[inputClass, props.className].join(" ")}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

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
					className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-surface)] p-4 text-[color:var(--color-bad)] text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{visibleAccounts.map((account) => (
				<form
					action={updateAccount}
					className="grid gap-2 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
					key={account.id}
				>
					<input name="id" type="hidden" value={account.id} />
					<TextInput defaultValue={account.name} name="name" />
					<TextInput
						defaultValue={account.institution ?? ""}
						name="institution"
					/>
					<Select
						defaultValue={account.type}
						name="type"
						options={accountTypeLabels}
					/>
					<TextInput
						defaultValue={formatMoneyInput(account.initialBalanceCents)}
						name="initialBalance"
					/>
					<TextInput
						defaultValue={account.creditCardClosingDay?.toString() ?? ""}
						name="closingDay"
						placeholder="Fecha"
					/>
					<TextInput
						defaultValue={account.creditCardDueDay?.toString() ?? ""}
						name="dueDay"
						placeholder="Vence"
					/>
					<label className="flex items-center gap-2 text-sm">
						<input
							defaultChecked={account.isActive}
							name="isActive"
							type="checkbox"
						/>{" "}
						Ativa
					</label>
					<p className="text-[color:var(--color-text-muted)] text-sm md:col-span-2">
						Saldo: {formatMoney(balances[account.id]?.normalBalanceCents ?? 0)}{" "}
						· Cartão: {formatMoney(balances[account.id]?.cardDebtCents ?? 0)}
					</p>
					<SubmitButton>Salvar</SubmitButton>
					<DangerSubmitButton formAction={archiveWithRollback}>
						Arquivar
					</DangerSubmitButton>
				</form>
			))}
			{visibleAccounts.length === 0 ? (
				<p className="rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-[color:var(--color-text-muted)] text-sm">
					Nenhuma conta cadastrada.
				</p>
			) : null}
		</div>
	);
}
