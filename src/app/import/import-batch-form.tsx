"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";

import {
	type CreateImportBatchState,
	createImportBatchWithState,
} from "~/app/_actions/finance-actions";
import { SubmitButton } from "~/components/submit-button";

const initialState: CreateImportBatchState = { error: null };

export function ImportBatchForm({
	accounts,
	cards,
	currentMonth,
	inputClass,
	templates,
}: {
	accounts: { id: number; name: string }[];
	cards: { id: number; name: string }[];
	currentMonth: string;
	inputClass: string;
	templates: { id: number; label: string }[];
}) {
	const [state, action] = useActionState(
		createImportBatchWithState,
		initialState,
	);
	const [importMode, setImportMode] = useState<"account" | "card">("account");
	const isCardImport = importMode === "card";

	return (
		<form action={action} className="grid gap-4">
			{state.error ? (
				<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
					{state.error}
				</p>
			) : null}

			<fieldset className="grid gap-2">
				<legend className="font-medium text-sm">
					O que você quer importar?
				</legend>
				<div className="grid gap-2 sm:grid-cols-2">
					<ModeOption
						checked={!isCardImport}
						description="Extrato de banco, conta corrente, conta pagamento ou carteira. Todas as linhas entram na mesma conta."
						label="Extrato de conta"
						name="importMode"
						onChange={() => setImportMode("account")}
						value="account"
					/>
					<ModeOption
						checked={isCardImport}
						description="Fatura fechada ou aberta de cartão. Você escolhe o cartão e o mês da fatura."
						label="Fatura de cartão"
						name="importMode"
						onChange={() => setImportMode("card")}
						value="card"
					/>
				</div>
			</fieldset>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{isCardImport ? (
					<>
						<FieldLabel
							hint="Escolha o cartão dono da fatura deste CSV."
							label="Cartão"
						>
							<select className={inputClass} name="cardId" required>
								<option value="">Selecione o cartão</option>
								{cards.map((card) => (
									<option key={card.id} value={card.id}>
										{card.name}
									</option>
								))}
							</select>
						</FieldLabel>
						<FieldLabel
							hint={`Mês/ano da fatura que receberá as linhas. Se digitar manualmente em outro navegador, use ${currentMonth}.`}
							label="Mês da fatura"
						>
							<input
								className={inputClass}
								defaultValue={currentMonth}
								name="invoiceMonthKey"
								required
								type="month"
							/>
						</FieldLabel>
					</>
				) : (
					<FieldLabel
						hint="Todas as linhas do CSV serão revisadas como movimentos desta conta."
						label="Conta de destino"
					>
						<select className={inputClass} name="accountId" required>
							<option value="">Selecione a conta</option>
							{accounts.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
					</FieldLabel>
				)}
				<FieldLabel
					hint="Modelo salvo com o mapeamento das colunas do CSV."
					label="Modelo de importação"
				>
					<select className={inputClass} name="templateId" required>
						<option value="">Escolha um modelo salvo</option>
						{templates.map((template) => (
							<option key={template.id} value={template.id}>
								{template.label}
							</option>
						))}
					</select>
				</FieldLabel>
				<FieldLabel
					hint="Só arquivos .csv. O conteúdo bruto não é salvo."
					label="Arquivo CSV"
				>
					<input
						accept=".csv,text/csv"
						className={inputClass}
						name="csvFile"
						required
						type="file"
					/>
				</FieldLabel>
			</div>
			<label className="flex items-center gap-2 text-muted-foreground text-sm">
				<input disabled name="rawFileStored" type="checkbox" /> Guardar arquivo
				original (desativado por privacidade)
			</label>
			<p className="text-muted-foreground text-xs">
				O CSV é lido em memória; só as linhas já parseadas e mascaradas ficam
				salvas para revisão.
			</p>
			<SubmitButton
				className="bg-primary font-semibold"
				pendingLabel="Enviando..."
			>
				Enviar para revisão
			</SubmitButton>
		</form>
	);
}

function ModeOption({
	checked,
	description,
	label,
	name,
	onChange,
	value,
}: {
	checked: boolean;
	description: string;
	label: string;
	name: string;
	onChange: () => void;
	value: string;
}) {
	return (
		<label
			className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${checked ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
		>
			<input
				checked={checked}
				className="mt-1"
				name={name}
				onChange={onChange}
				type="radio"
				value={value}
			/>
			<span>
				<span className="block font-medium">{label}</span>
				<span className="mt-1 block text-muted-foreground text-xs">
					{description}
				</span>
			</span>
		</label>
	);
}

function FieldLabel({
	children,
	hint,
	label,
}: {
	children: ReactNode;
	hint?: string;
	label: string;
}) {
	return (
		<div className="grid gap-2 text-sm">
			<span className="font-medium">{label}</span>
			{children}
			{hint ? (
				<span className="text-muted-foreground text-xs">{hint}</span>
			) : null}
		</div>
	);
}
