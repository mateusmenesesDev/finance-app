"use client";

import { useState } from "react";

import { createImportCategoryRule } from "~/app/_actions/finance-actions";
import { ActionDialog } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Option = { id: number; name: string };

type RuleCategoryOption = Option & { kind: "income" | "expense" };

type Props = {
	accounts: Option[];
	categories: RuleCategoryOption[];
};

const inputClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const wrapperBase = "grid gap-1 text-muted-foreground text-sm";

export function ImportRuleForm({ accounts, categories }: Props) {
	const [action, setAction] = useState<"categorize" | "ignore" | "transfer">(
		"categorize",
	);
	const isIgnore = action === "ignore";
	const isTransfer = action === "transfer";
	return (
		<ActionDialog
			action={createImportCategoryRule}
			contentClassName="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
			description="Regras casam pelo texto do CSV e aceleram a revisão dos próximos lotes."
			footerClassName={
				isIgnore ? "sm:col-span-2 xl:col-span-4" : "sm:col-span-2 xl:col-span-2"
			}
			formClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
			pendingLabel="Criando..."
			submitButtonProps={{ className: "w-full font-semibold" }}
			submitLabel="Criar regra"
			successMessage="Regra criada."
			title="Nova regra de categorização"
			trigger={<Button>Nova regra</Button>}
		>
			<div className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
				<Label htmlFor="rule-description">Texto a procurar</Label>
				<Input
					id="rule-description"
					name="description"
					placeholder="Ex.: Mercado Exemplo"
					required
				/>
				<span className="text-muted-foreground text-xs">
					Trecho da descrição que aparece no CSV.
				</span>
			</div>
			<label className={wrapperBase}>
				<span>Ação</span>
				<select
					className={inputClass}
					name="action"
					onChange={(event) =>
						setAction(
							event.target.value as "categorize" | "ignore" | "transfer",
						)
					}
					value={action}
				>
					<option value="categorize">Sugerir categoria</option>
					<option value="transfer">Sugerir transferência</option>
					<option value="ignore">Ignorar linha</option>
				</select>
				<span className="text-muted-foreground text-xs">
					{isIgnore
						? "Linhas que baterem viram “ignorar” na revisão."
						: isTransfer
							? "Linhas que baterem viram transferências na revisão."
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
					<option value="expense">Saída/despesa no CSV</option>
					<option value="income">Entrada/receita no CSV</option>
				</select>
			</label>
			<div className={wrapperBase}>
				<Label htmlFor="rule-amount">Valor aproximado</Label>
				<Input id="rule-amount" name="amount" placeholder="Ex.: 49,90" />
				<span className="text-muted-foreground text-xs">
					Restringe a um valor próximo. Opcional.
				</span>
			</div>
			<div className={wrapperBase}>
				<Label htmlFor="rule-amount-tolerance">Tolerância</Label>
				<Input
					id="rule-amount-tolerance"
					name="amountTolerance"
					placeholder="Ex.: 2,00"
				/>
				<span className="text-muted-foreground text-xs">
					Quanto pode variar do valor acima. Opcional.
				</span>
			</div>
			<div className={wrapperBase}>
				<Label htmlFor="rule-priority">Prioridade</Label>
				<Input id="rule-priority" name="priority" placeholder="Ex.: 10" />
				<span className="text-muted-foreground text-xs">
					Maior = aplicada antes.
				</span>
			</div>
			<div className={wrapperBase}>
				<span>Conta do lote (opcional)</span>
				<select className={inputClass} name="accountId">
					<option value="">Qualquer conta</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
				<span className="text-muted-foreground text-xs">
					Aplique só em lotes importados de uma conta específica.
				</span>
			</div>
			{isTransfer ? (
				<>
					<div className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
						<span>Origem da transferência</span>
						<select className={inputClass} name="sourceAccountId" required>
							<option value="">Selecione a origem</option>
							{accounts.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
						<span className="text-muted-foreground text-xs">
							Conta real de onde o dinheiro saiu.
						</span>
					</div>
					<div className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
						<span>Destino da transferência</span>
						<select className={inputClass} name="destinationAccountId" required>
							<option value="">Selecione o destino</option>
							{accounts.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
						<span className="text-muted-foreground text-xs">
							Conta real para onde o dinheiro entrou.
						</span>
					</div>
				</>
			) : isIgnore ? null : (
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
					<span className="text-muted-foreground text-xs">
						Categoria sugerida quando a regra bater.
					</span>
				</div>
			)}
			{isIgnore ? null : (
				<div className={`${wrapperBase} sm:col-span-2 xl:col-span-2`}>
					<Label htmlFor="rule-description-override">
						Reescrever descrição final
					</Label>
					<Input
						id="rule-description-override"
						name="descriptionOverride"
						placeholder="Ex.: Supermercado mensal"
					/>
					<span className="text-muted-foreground text-xs">
						Opcional. Se preenchido, substitui a descrição da transação quando a
						regra bater. Deixe vazio para manter a do CSV.
					</span>
				</div>
			)}
		</ActionDialog>
	);
}
