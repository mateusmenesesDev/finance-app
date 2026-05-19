"use client";

import { useState } from "react";

import { createImportCategoryRule } from "~/app/_actions/finance-actions";
import { SubmitButton } from "~/app/_components/pending-submit-button";

type Option = { id: number; name: string };

type RuleCategoryOption = Option & { kind: "income" | "expense" };

type Props = {
	accounts: Option[];
	categories: RuleCategoryOption[];
};

const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]";

const wrapperBase = "grid gap-1 text-[color:var(--color-text-muted)] text-sm";

export function ImportRuleForm({ accounts, categories }: Props) {
	const [action, setAction] = useState<"categorize" | "ignore">("categorize");
	const isIgnore = action === "ignore";
	return (
		<form
			action={createImportCategoryRule}
			className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
		>
			<label className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
				<span>Texto a procurar</span>
				<input
					className={inputClass}
					name="description"
					placeholder="Ex.: Mercado Exemplo"
					required
				/>
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					Trecho da descrição que aparece no CSV.
				</span>
			</label>
			<label className={wrapperBase}>
				<span>Ação</span>
				<select
					className={inputClass}
					name="action"
					onChange={(event) =>
						setAction(event.target.value as "categorize" | "ignore")
					}
					value={action}
				>
					<option value="categorize">Sugerir categoria</option>
					<option value="ignore">Ignorar linha</option>
				</select>
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					{isIgnore
						? "Linhas que baterem viram “ignorar” na revisão."
						: "Linhas que baterem ganham a categoria escolhida."}
				</span>
			</label>
			<label className={wrapperBase}>
				<span>Modo de busca</span>
				<select
					className={inputClass}
					defaultValue="contains"
					name="textMatchMode"
				>
					<option value="contains">Contém</option>
					<option value="exact">Igual exato</option>
				</select>
			</label>
			<label className={wrapperBase}>
				<span>Tipo da linha</span>
				<select
					className={inputClass}
					defaultValue={isIgnore ? "any" : "expense"}
					key={action}
					name="movementType"
				>
					{isIgnore ? <option value="any">Qualquer tipo</option> : null}
					<option value="expense">Despesa</option>
					<option value="income">Receita</option>
				</select>
			</label>
			<label className={wrapperBase}>
				<span>Valor aproximado</span>
				<input className={inputClass} name="amount" placeholder="Ex.: 49,90" />
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					Restringe a um valor próximo. Opcional.
				</span>
			</label>
			<label className={wrapperBase}>
				<span>Tolerância</span>
				<input
					className={inputClass}
					name="amountTolerance"
					placeholder="Ex.: 2,00"
				/>
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					Quanto pode variar do valor acima. Opcional.
				</span>
			</label>
			<label className={wrapperBase}>
				<span>Prioridade</span>
				<input className={inputClass} name="priority" placeholder="Ex.: 10" />
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					Maior = aplicada antes.
				</span>
			</label>
			<div className={wrapperBase}>
				<span>Conta (opcional)</span>
				<select className={inputClass} name="accountId">
					<option value="">Qualquer conta</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					Aplique só em lotes de uma conta específica.
				</span>
			</div>
			{isIgnore ? null : (
				<div className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
					<span>Categoria de destino</span>
					<select className={inputClass} name="categoryId" required>
						<option value="">Selecione uma categoria</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name} ·{" "}
								{category.kind === "income" ? "receita" : "despesa"}
							</option>
						))}
					</select>
					<span className="text-[color:var(--color-text-subtle)] text-xs">
						Categoria sugerida quando a regra bater.
					</span>
				</div>
			)}
			{isIgnore ? null : (
				<label className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
					<span>Reescrever descrição final</span>
					<input
						className={inputClass}
						name="descriptionOverride"
						placeholder="Ex.: Supermercado mensal"
					/>
					<span className="text-[color:var(--color-text-subtle)] text-xs">
						Opcional. Se preenchido, substitui a descrição da transação quando a
						regra bater. Deixe vazio para manter a do CSV.
					</span>
				</label>
			)}
			<SubmitButton
				className={`self-end bg-[color:var(--color-accent)] font-semibold ${
					isIgnore
						? "sm:col-span-2 xl:col-span-4"
						: "sm:col-span-2 xl:col-span-2"
				}`}
				pendingLabel="Criando..."
			>
				Criar regra
			</SubmitButton>
		</form>
	);
}
