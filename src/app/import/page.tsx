import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	archiveImportCategoryRule,
	archiveImportTemplate,
	cancelImportBatch,
	createImportBatch,
	createImportCategoryRule,
	createImportTemplate,
	revertImportBatch,
	updateImportTemplate,
} from "~/app/_actions/finance-actions";
import {
	DangerSubmitButton,
	FinanceShell,
	SubmitButton,
} from "~/app/_components/finance-ui";
import {
	type ConfirmFormRow,
	ConfirmImportForm,
} from "~/app/import/confirm-import-form";
import {
	defaultTemplateConfig,
	normalizeImportTemplateConfig,
} from "~/lib/import-rules";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import {
	categories,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importRows,
	importTemplates,
	recurrences,
} from "~/server/db/schema";

type ImportPageProps = {
	searchParams?: Promise<{ batchId?: string }>;
};

const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]";

const statusLabels = {
	draft: "rascunho",
	reviewing: "em revisão",
	confirmed: "confirmado",
	cancelled: "cancelado",
	reverted: "revertido",
};

export default async function ImportPage({ searchParams }: ImportPageProps) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const params = await searchParams;
	const selectedBatchId = params?.batchId ? Number(params.batchId) : null;
	const [accounts, activeCategories, templates, batches, rules] =
		await Promise.all([
			db
				.select()
				.from(financialAccounts)
				.where(eq(financialAccounts.userId, session.user.id))
				.orderBy(asc(financialAccounts.name)),
			db
				.select()
				.from(categories)
				.where(eq(categories.userId, session.user.id))
				.orderBy(asc(categories.kind), asc(categories.name)),
			db
				.select()
				.from(importTemplates)
				.where(eq(importTemplates.userId, session.user.id))
				.orderBy(asc(importTemplates.name)),
			db
				.select()
				.from(importBatches)
				.where(eq(importBatches.userId, session.user.id))
				.orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
			db
				.select()
				.from(importCategoryRules)
				.where(eq(importCategoryRules.userId, session.user.id))
				.orderBy(
					desc(importCategoryRules.createdAt),
					desc(importCategoryRules.id),
				),
		]);
	const selectedBatch = selectedBatchId
		? batches.find((batch) => batch.id === selectedBatchId)
		: batches[0];
	const rows = selectedBatch
		? await db
				.select()
				.from(importRows)
				.where(
					and(
						eq(importRows.batchId, selectedBatch.id),
						eq(importRows.userId, session.user.id),
					),
				)
				.orderBy(asc(importRows.rowNumber))
		: [];
	const suggestedRecurrenceIds = [
		...new Set(rows.flatMap((row) => row.suggestedRecurrenceId ?? [])),
	];
	const suggestedRecurrences = suggestedRecurrenceIds.length
		? await db
				.select()
				.from(recurrences)
				.where(eq(recurrences.userId, session.user.id))
		: [];
	const accountById = new Map(accounts.map((account) => [account.id, account]));
	const templateById = new Map(
		templates.map((template) => [template.id, template]),
	);
	const usableAccounts = accounts.filter(
		(account) => !account.isArchived && account.isActive,
	);
	const activeTemplates = templates.filter((template) => !template.isArchived);
	const usableCategories = activeCategories.filter(
		(category) => !category.isArchived,
	);
	const categoryById = new Map(
		activeCategories.map((category) => [category.id, category]),
	);

	return (
		<FinanceShell
			description="CSV pequeno/médio, uma conta por lote, modelos reutilizáveis, revisão manual e sem armazenar arquivo bruto."
			eyebrow="Importação"
			title="Centro de importação CSV"
		>
			<Panel title="Ajuda CSV">
				<details>
					<summary className="flex cursor-pointer items-center justify-between gap-3 text-[color:var(--color-text-muted)] text-sm hover:text-[color:var(--color-text)]">
						<span>
							Como o app lê seu CSV — abra antes de criar o primeiro modelo.
						</span>
						<span className="text-[color:var(--color-text-subtle)] text-xs">
							mostrar/ocultar
						</span>
					</summary>
					<ul className="mt-4 list-disc space-y-1 pl-5 text-[color:var(--color-text-muted)] text-sm">
						<li>
							No modelo, você digita o <strong>texto do cabeçalho</strong> de
							cada coluna do CSV (ex.: <code>Data</code>, <code>Valor</code>) —
							não a posição (<code>coluna 1</code>, <code>2</code>).
						</li>
						<li>
							Valor pode vir em uma coluna única com sinal (positivo/negativo)
							ou em duas colunas separadas para entrada e saída.
						</li>
						<li>
							O arquivo bruto <strong>não</strong> é salvo. Apenas as linhas já
							parseadas e mascaradas ficam no lote para revisão.
						</li>
						<li>
							A prévia de cada linha mostra os valores lidos do CSV ao lado dos
							normalizados — use isso para detectar coluna trocada.
						</li>
					</ul>
					<Link
						className="mt-3 inline-block text-[color:var(--color-accent)] text-sm hover:underline"
						href="/import/help"
					>
						Abrir guia completo de exportação CSV →
					</Link>
				</details>
			</Panel>

			<section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
				<Panel title="Novo modelo reutilizável">
					<details>
						<summary className="cursor-pointer rounded-2xl border border-[color:var(--color-border)] px-4 py-3 font-medium text-sm hover:bg-[color:var(--color-surface-muted)]">
							Abrir configuração de modelo
						</summary>
						<form action={createImportTemplate} className="mt-4 grid gap-4">
							<div className="rounded-2xl border border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-bg)] p-3 text-[color:var(--color-warn)] text-sm">
								<p className="font-medium">
									Preencha cada campo com o texto da coluna no cabeçalho.
								</p>
								<p className="mt-1">
									Ex.: se o CSV começa com{" "}
									<code>Data;Descrição;Valor;Identificador</code>, digite{" "}
									<code>Data</code>, <code>Descrição</code>, <code>Valor</code>{" "}
									e <code>Identificador</code> abaixo. Não use posição (1, 2,
									3...).
								</p>
							</div>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								<LabelledInput
									hint="Como você vai chamar este modelo na lista de lotes."
									label="Nome do modelo"
									name="name"
									placeholder="Ex.: Nubank conta"
									required
								/>
								<LabelledInput
									hint="Banco, corretora ou cartão de onde vem o CSV. Opcional."
									label="Origem"
									name="sourceLabel"
									placeholder="Ex.: Nubank"
								/>
								<LabelledSelect
									defaultValue={defaultTemplateConfig.amountMode}
									hint="Como o valor aparece no CSV."
									label="Formato do valor"
									name="amountMode"
									options={{
										signed: "Uma coluna, com sinal (+/-)",
										separate: "Duas colunas (entrada e saída)",
									}}
								/>
							</div>
							<div className="grid gap-2">
								<h3 className="font-medium text-sm">Colunas obrigatórias</h3>
								<p className="text-[color:var(--color-text-subtle)] text-xs">
									Data e descrição são sempre necessárias. Para valor, preencha
									“valor único” ou use entrada/saída abaixo.
								</p>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<LabelledInput
										defaultValue={defaultTemplateConfig.dateColumn}
										label="Data"
										name="dateColumn"
										placeholder="Data"
										required
									/>
									<LabelledInput
										defaultValue={defaultTemplateConfig.descriptionColumn}
										label="Descrição"
										name="descriptionColumn"
										placeholder="Descrição"
										required
									/>
									<LabelledInput
										defaultValue={defaultTemplateConfig.amountColumn}
										hint="Use só quando o valor vem em uma coluna única."
										label="Valor (coluna única)"
										name="amountColumn"
										placeholder="Valor"
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<h3 className="font-medium text-sm">Colunas opcionais</h3>
								<p className="text-[color:var(--color-text-subtle)] text-xs">
									Deixe vazio o que seu CSV não tiver.
								</p>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<LabelledInput
										hint="Coluna que diz se a linha é receita ou despesa."
										label="Tipo / sinal"
										name="kindColumn"
										placeholder="Tipo"
									/>
									<LabelledInput
										hint="Use só com valor em duas colunas."
										label="Entrada"
										name="incomeAmountColumn"
										placeholder="Entrada"
									/>
									<LabelledInput
										hint="Use só com valor em duas colunas."
										label="Saída"
										name="expenseAmountColumn"
										placeholder="Saída"
									/>
									<LabelledInput
										hint="Categoria que o banco já sugere."
										label="Categoria do banco"
										name="categoryColumn"
										placeholder="Categoria"
									/>
									<LabelledInput
										hint="ID único da transação no banco. Evita duplicar."
										label="Identificador externo"
										name="externalIdColumn"
										placeholder="Identificador"
									/>
									<LabelledInput
										label="Observação"
										name="notesColumn"
										placeholder="Observação"
									/>
								</div>
							</div>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								<LabelledSelect
									defaultValue={defaultTemplateConfig.dateFormat}
									label="Formato da data"
									name="dateFormat"
									options={{
										"dd/mm/yyyy": "dd/mm/aaaa",
										"dd-mm-yyyy": "dd-mm-aaaa",
										"yyyy-mm-dd": "aaaa-mm-dd",
									}}
								/>
								<LabelledSelect
									defaultValue={defaultTemplateConfig.delimiter}
									hint="O que separa as colunas no CSV."
									label="Separador de colunas"
									name="delimiter"
									options={{
										auto: "Detectar automaticamente",
										",": "Vírgula ( , )",
										";": "Ponto e vírgula ( ; )",
									}}
								/>
								<LabelledSelect
									defaultValue={defaultTemplateConfig.decimalSeparator}
									hint="O que separa centavos do inteiro."
									label="Separador decimal"
									name="decimalSeparator"
									options={{
										auto: "Detectar automaticamente",
										",": "Vírgula (1.234,56)",
										".": "Ponto (1,234.56)",
									}}
								/>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<LabelledInput
									defaultValue={defaultTemplateConfig.incomeTokens.join(", ")}
									hint="Texto na coluna 'tipo' que indica receita. Separe por vírgula."
									label="Palavras que indicam receita"
									name="incomeTokens"
									placeholder="receita, crédito, entrada"
								/>
								<LabelledInput
									defaultValue={defaultTemplateConfig.expenseTokens.join(", ")}
									hint="Texto na coluna 'tipo' que indica despesa. Separe por vírgula."
									label="Palavras que indicam despesa"
									name="expenseTokens"
									placeholder="despesa, débito, saída"
								/>
							</div>
							<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
								<input name="invertSign" type="checkbox" /> Inverter sinal do
								valor
							</label>
							<SubmitButton
								className="bg-[color:var(--color-accent)] font-semibold"
								pendingLabel="Salvando..."
							>
								Salvar modelo
							</SubmitButton>
						</form>
					</details>
				</Panel>

				<Panel title="Novo lote">
					<form action={createImportBatch} className="grid gap-3">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<FieldLabel
								hint="Todas as linhas vão para esta conta."
								label="Conta de destino"
							>
								<select className={inputClass} name="accountId" required>
									<option value="">Escolha uma conta</option>
									{usableAccounts.map((account) => (
										<option key={account.id} value={account.id}>
											{account.name}
										</option>
									))}
								</select>
							</FieldLabel>
							<FieldLabel
								hint="Define como o CSV vai ser interpretado."
								label="Modelo de importação"
							>
								<select className={inputClass} name="templateId" required>
									<option value="">Escolha um modelo salvo</option>
									{activeTemplates.map((template) => (
										<option key={template.id} value={template.id}>
											{templateOptionLabel(template)}
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
						<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
							<input disabled name="rawFileStored" type="checkbox" /> Guardar
							arquivo original (desativado por privacidade)
						</label>
						<p className="text-[color:var(--color-text-subtle)] text-xs">
							O CSV é lido em memória; só as linhas já parseadas e mascaradas
							ficam salvas para revisão.
						</p>
						<SubmitButton
							className="bg-[color:var(--color-accent)] font-semibold"
							pendingLabel="Enviando..."
						>
							Enviar para revisão
						</SubmitButton>
					</form>

					<div className="mt-6 grid gap-2">
						<h3 className="font-medium">Modelos salvos</h3>
						{activeTemplates.map((template) => (
							<TemplateCard key={template.id} template={template} />
						))}
						{activeTemplates.length === 0 && (
							<p className="text-[color:var(--color-text-muted)] text-sm">
								Nenhum modelo salvo ainda. Use o bloco ao lado para criar o
								primeiro.
							</p>
						)}
					</div>
				</Panel>
			</section>

			<ImportRulePanel
				accountById={accountById}
				categoryById={categoryById}
				ruleAccounts={usableAccounts}
				ruleCategories={usableCategories}
				rules={rules}
			/>

			<section className="grid gap-6 lg:grid-cols-[0.4fr_0.6fr]">
				<Panel title="Histórico de lotes">
					<div className="grid gap-2">
						{batches.map((batch) => (
							<Link
								className={`rounded-2xl border p-4 text-sm ${selectedBatch?.id === batch.id ? "border-[color:var(--color-good-border)] bg-[color:var(--color-good-bg)]" : "border-[color:var(--color-border-subtle)]"}`}
								href={`/import?batchId=${batch.id}`}
								key={batch.id}
							>
								<p className="truncate font-medium">
									<span className="text-[color:var(--color-text-subtle)]">
										#{batch.id}
									</span>{" "}
									{batch.originalFileName}
								</p>
								<p className="text-[color:var(--color-text-muted)] text-xs">
									{formatDateTime(batch.createdAt)} ·{" "}
									{statusLabels[batch.status]} · {batch.rowCount} linha(s)
								</p>
								<p className="mt-1 text-[color:var(--color-text-muted)] text-xs">
									Conta: {accountById.get(batch.accountId)?.name ?? "—"} ·
									Modelo:{" "}
									{batch.importTemplateId
										? (templateById.get(batch.importTemplateId)?.name ??
											"arquivado")
										: "—"}
								</p>
							</Link>
						))}
						{batches.length === 0 && (
							<p className="text-[color:var(--color-text-muted)] text-sm">
								Nenhum lote enviado ainda. Crie um modelo e envie um CSV para
								começar.
							</p>
						)}
					</div>
				</Panel>

				<Panel
					title={
						selectedBatch ? `Revisão do lote #${selectedBatch.id}` : "Revisão"
					}
				>
					{selectedBatch ? (
						<BatchReview
							reviewAccounts={usableAccounts}
							reviewCategories={usableCategories}
							reviewRecurrences={suggestedRecurrences.filter((recurrence) =>
								suggestedRecurrenceIds.includes(recurrence.id),
							)}
							reviewRules={rules}
							rows={rows}
							selectedBatch={selectedBatch}
						/>
					) : (
						<p className="text-[color:var(--color-text-muted)] text-sm">
							Selecione um lote no histórico ou envie um novo CSV para começar a
							revisão.
						</p>
					)}
				</Panel>
			</section>
		</FinanceShell>
	);
}

function TemplateCard({
	template,
}: {
	template: typeof importTemplates.$inferSelect;
}) {
	const config = normalizeImportTemplateConfig(template.config);
	return (
		<div className="rounded-2xl border border-[color:var(--color-border-subtle)] p-3 text-sm">
			<details>
				<summary className="cursor-pointer list-none">
					<span className="font-medium">{template.name}</span>
					<span className="ml-2 text-[color:var(--color-text-muted)]">
						{template.sourceLabel ?? "sem origem"} ·{" "}
						{config.amountMode === "signed" ? "valor único" : "entrada/saída"}
					</span>
					<span className="block text-[color:var(--color-text-subtle)]">
						{config.dateColumn}, {config.descriptionColumn},{" "}
						{config.amountColumn ??
							`${config.incomeAmountColumn}/${config.expenseAmountColumn}`}
					</span>
				</summary>
				<form action={updateImportTemplate} className="mt-3 grid gap-4">
					<input name="id" type="hidden" value={template.id} />
					<div className="rounded-xl border border-[color:var(--color-border-subtle)] p-3 text-[color:var(--color-text-muted)] text-xs">
						<p className="font-medium text-[color:var(--color-text)]">
							Mapeamento atual
						</p>
						<p className="mt-1">{templateMappingText(config)}</p>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<LabelledInput
							defaultValue={template.name}
							label="Nome do modelo"
							name="name"
							required
						/>
						<LabelledInput
							defaultValue={template.sourceLabel ?? ""}
							label="Origem"
							name="sourceLabel"
							placeholder="Banco/cartão"
						/>
						<LabelledSelect
							defaultValue={config.amountMode}
							label="Formato do valor"
							name="amountMode"
							options={{
								signed: "Uma coluna, com sinal",
								separate: "Duas colunas (entrada/saída)",
							}}
						/>
					</div>
					<div className="grid gap-2">
						<h3 className="font-medium text-sm">Colunas obrigatórias</h3>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<LabelledInput
								defaultValue={config.dateColumn}
								label="Data"
								name="dateColumn"
								required
							/>
							<LabelledInput
								defaultValue={config.descriptionColumn}
								label="Descrição"
								name="descriptionColumn"
								required
							/>
							<LabelledInput
								defaultValue={config.amountColumn ?? ""}
								label="Valor (coluna única)"
								name="amountColumn"
							/>
						</div>
					</div>
					<div className="grid gap-2">
						<h3 className="font-medium text-sm">Colunas opcionais</h3>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<LabelledInput
								defaultValue={config.kindColumn ?? ""}
								label="Tipo / sinal"
								name="kindColumn"
							/>
							<LabelledInput
								defaultValue={config.incomeAmountColumn ?? ""}
								label="Entrada"
								name="incomeAmountColumn"
							/>
							<LabelledInput
								defaultValue={config.expenseAmountColumn ?? ""}
								label="Saída"
								name="expenseAmountColumn"
							/>
							<LabelledInput
								defaultValue={config.categoryColumn ?? ""}
								label="Categoria do banco"
								name="categoryColumn"
							/>
							<LabelledInput
								defaultValue={config.externalIdColumn ?? ""}
								label="Identificador externo"
								name="externalIdColumn"
							/>
							<LabelledInput
								defaultValue={config.notesColumn ?? ""}
								label="Observação"
								name="notesColumn"
							/>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<LabelledSelect
							defaultValue={config.dateFormat}
							label="Formato da data"
							name="dateFormat"
							options={{
								"dd/mm/yyyy": "dd/mm/aaaa",
								"dd-mm-yyyy": "dd-mm-aaaa",
								"yyyy-mm-dd": "aaaa-mm-dd",
							}}
						/>
						<LabelledSelect
							defaultValue={config.delimiter}
							label="Separador de colunas"
							name="delimiter"
							options={{
								auto: "Detectar automaticamente",
								",": "Vírgula ( , )",
								";": "Ponto e vírgula ( ; )",
							}}
						/>
						<LabelledSelect
							defaultValue={config.decimalSeparator}
							label="Separador decimal"
							name="decimalSeparator"
							options={{
								auto: "Detectar automaticamente",
								",": "Vírgula (1.234,56)",
								".": "Ponto (1,234.56)",
							}}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<LabelledInput
							defaultValue={config.incomeTokens.join(", ")}
							label="Palavras que indicam receita"
							name="incomeTokens"
						/>
						<LabelledInput
							defaultValue={config.expenseTokens.join(", ")}
							label="Palavras que indicam despesa"
							name="expenseTokens"
						/>
					</div>
					<label className="flex items-center gap-2 text-[color:var(--color-text-muted)]">
						<input
							defaultChecked={config.invertSign}
							name="invertSign"
							type="checkbox"
						/>{" "}
						Inverter sinal
					</label>
					<div className="flex gap-2">
						<SubmitButton
							className="bg-[color:var(--color-accent)] px-3 font-semibold"
							pendingLabel="Salvando..."
						>
							Salvar alterações
						</SubmitButton>
					</div>
				</form>
				<form action={archiveImportTemplate} className="mt-2">
					<input name="id" type="hidden" value={template.id} />
					<DangerSubmitButton className="px-3">Arquivar</DangerSubmitButton>
				</form>
			</details>
		</div>
	);
}

function templateOptionLabel(template: typeof importTemplates.$inferSelect) {
	const config = normalizeImportTemplateConfig(template.config);
	return `${template.name} — ${templateMappingText(config)}`;
}

function templateMappingText(
	config: ReturnType<typeof normalizeImportTemplateConfig>,
) {
	const amount =
		config.amountMode === "signed"
			? `valor: ${config.amountColumn ?? "—"}`
			: `entrada: ${config.incomeAmountColumn ?? "—"}; saída: ${config.expenseAmountColumn ?? "—"}`;
	const optional = [
		config.externalIdColumn ? `id: ${config.externalIdColumn}` : null,
		config.kindColumn ? `tipo: ${config.kindColumn}` : null,
	]
		.filter(Boolean)
		.join("; ");
	return [
		`data: ${config.dateColumn}`,
		`descrição: ${config.descriptionColumn}`,
		amount,
		optional || null,
	]
		.filter(Boolean)
		.join("; ");
}

function ImportRulePanel({
	ruleAccounts,
	accountById,
	ruleCategories,
	categoryById,
	rules,
}: {
	ruleAccounts: (typeof financialAccounts.$inferSelect)[];
	accountById: Map<number, typeof financialAccounts.$inferSelect>;
	ruleCategories: (typeof categories.$inferSelect)[];
	categoryById: Map<number, typeof categories.$inferSelect>;
	rules: (typeof importCategoryRules.$inferSelect)[];
}) {
	const activeRules = rules.filter((rule) => !rule.isArchived);
	return (
		<Panel title="Regras de categorização">
			<p className="-mt-2 mb-4 text-[color:var(--color-text-muted)] text-sm">
				Quando uma linha do CSV bate com o texto da regra, o app já sugere a
				categoria na revisão. Você ainda pode aceitar, trocar ou ignorar.
			</p>
			<form
				action={createImportCategoryRule}
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
			>
				<LabelledInput
					hint="Trecho da descrição que aparece no CSV."
					label="Texto a procurar"
					name="description"
					placeholder="Ex.: Mercado Exemplo"
					required
					wrapperClassName="sm:col-span-2 xl:col-span-2"
				/>
				<LabelledSelect
					defaultValue="contains"
					hint="Como comparar o texto."
					label="Modo de busca"
					name="textMatchMode"
					options={{ contains: "Contém", exact: "Igual exato" }}
				/>
				<LabelledSelect
					defaultValue="expense"
					label="Tipo da linha"
					name="movementType"
					options={{ expense: "Despesa", income: "Receita" }}
				/>
				<LabelledInput
					hint="Restringe a um valor próximo. Opcional."
					label="Valor aproximado"
					name="amount"
					placeholder="Ex.: 49,90"
				/>
				<LabelledInput
					hint="Quanto pode variar do valor acima. Opcional."
					label="Tolerância"
					name="amountTolerance"
					placeholder="Ex.: 2,00"
				/>
				<LabelledInput
					hint="Maior = aplicada antes."
					label="Prioridade"
					name="priority"
					placeholder="Ex.: 10"
				/>
				<FieldLabel
					hint="Aplique só em lotes de uma conta específica."
					label="Conta (opcional)"
				>
					<select className={inputClass} name="accountId">
						<option value="">Qualquer conta</option>
						{ruleAccounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
				</FieldLabel>
				<FieldLabel
					hint="Categoria sugerida quando a regra bater."
					label="Categoria de destino"
					wrapperClassName="sm:col-span-2 xl:col-span-2"
				>
					<select className={inputClass} name="categoryId" required>
						<option value="">Selecione uma categoria</option>
						{ruleCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name} ·{" "}
								{category.kind === "income" ? "receita" : "despesa"}
							</option>
						))}
					</select>
				</FieldLabel>
				<SubmitButton
					className="self-end bg-[color:var(--color-accent)] font-semibold sm:col-span-2 xl:col-span-2"
					pendingLabel="Criando..."
				>
					Criar regra
				</SubmitButton>
			</form>
			<div className="mt-6 grid gap-2">
				<h3 className="font-medium text-sm">Regras ativas</h3>
				{activeRules.map((rule) => {
					const category = categoryById.get(rule.categoryId);
					const account = rule.accountId
						? accountById.get(rule.accountId)
						: null;
					return (
						<div
							className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 text-sm"
							key={rule.id}
						>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-[color:var(--color-text)]">
									“{rule.normalizedDescription}” →{" "}
									{category?.name ?? "categoria arquivada"}
								</p>
								<p className="mt-1 text-[color:var(--color-text-muted)] text-xs">
									{rule.textMatchMode === "contains" ? "contém" : "igual"} ·{" "}
									{movementTypeLabels[rule.movementType] ?? rule.movementType} ·{" "}
									{account?.name ?? "qualquer conta"} · prioridade{" "}
									{rule.priority}
								</p>
								<div className="mt-2 flex flex-wrap gap-2">
									<StatChip label="Sugestões" value={rule.matchCount} />
									<StatChip
										label="Aceitas"
										tone={rule.acceptedCount > 0 ? "good" : "default"}
										value={rule.acceptedCount}
									/>
									<StatChip
										label="Rejeitadas"
										tone={rule.rejectedCount > 0 ? "warn" : "default"}
										value={rule.rejectedCount}
									/>
								</div>
							</div>
							<form action={archiveImportCategoryRule}>
								<input name="id" type="hidden" value={rule.id} />
								<DangerSubmitButton className="px-3">
									Arquivar
								</DangerSubmitButton>
							</form>
						</div>
					);
				})}
				{activeRules.length === 0 && (
					<p className="text-[color:var(--color-text-muted)] text-sm">
						Nenhuma regra ativa. Crie uma acima para acelerar a categorização
						dos próximos lotes.
					</p>
				)}
			</div>
		</Panel>
	);
}

function BatchReview({
	selectedBatch,
	rows,
	reviewAccounts,
	reviewCategories,
	reviewRules,
	reviewRecurrences,
}: {
	selectedBatch: typeof importBatches.$inferSelect;
	rows: (typeof importRows.$inferSelect)[];
	reviewAccounts: (typeof financialAccounts.$inferSelect)[];
	reviewCategories: (typeof categories.$inferSelect)[];
	reviewRules: (typeof importCategoryRules.$inferSelect)[];
	reviewRecurrences: (typeof recurrences.$inferSelect)[];
}) {
	const ruleById = new Map(reviewRules.map((rule) => [rule.id, rule]));
	const recurrenceById = new Map(
		reviewRecurrences.map((recurrence) => [recurrence.id, recurrence]),
	);
	const categoryByIdLocal = new Map(
		reviewCategories.map((category) => [category.id, category]),
	);
	const reviewFormRows: ConfirmFormRow[] = rows.map((row) => ({
		id: row.id,
		rowNumber: row.rowNumber,
		status: row.status,
		occurredOn: row.occurredOn,
		amountCents: row.amountCents,
		movementType:
			row.movementType === "income" || row.movementType === "expense"
				? row.movementType
				: null,
		accountId: row.accountId,
		originalDescription: row.originalDescription,
		bankCategory: row.bankCategory,
		parsedData: row.parsedData,
		hadSensitiveData: rowHadSensitiveData(row.parsedData),
		validationError: row.validationError,
		suggestedCategoryId: row.suggestedCategoryId,
		suggestedCategoryName: row.suggestedCategoryId
			? (categoryByIdLocal.get(row.suggestedCategoryId)?.name ?? null)
			: null,
		suggestedRuleDescription: row.suggestedRuleId
			? (ruleById.get(row.suggestedRuleId)?.normalizedDescription ?? null)
			: null,
		suggestedRecurrenceId: row.suggestedRecurrenceId,
		suggestedRecurrenceOccurrenceOn: row.suggestedRecurrenceOccurrenceOn,
		suggestedRecurrenceName: row.suggestedRecurrenceId
			? (recurrenceById.get(row.suggestedRecurrenceId)?.name ?? null)
			: null,
	}));
	const totals = rows.reduce(
		(summary, row) => {
			if (row.status === "ignored") summary.ignored++;
			if (row.status === "duplicate") summary.duplicates++;
			if (row.status === "invalid") summary.invalid++;
			if (row.movementType === "income") summary.income += row.amountCents ?? 0;
			if (row.movementType === "expense")
				summary.expense += row.amountCents ?? 0;
			if (row.movementType === "transfer")
				summary.transfer += row.amountCents ?? 0;
			return summary;
		},
		{
			income: 0,
			expense: 0,
			transfer: 0,
			ignored: 0,
			duplicates: 0,
			invalid: 0,
		},
	);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<p className="truncate text-[color:var(--color-text-muted)] text-sm">
						<span className="font-medium text-[color:var(--color-text)]">
							{selectedBatch.originalFileName}
						</span>{" "}
						· arquivo bruto{" "}
						{selectedBatch.rawFileStored ? "guardado" : "não guardado"}
					</p>
				</div>
				{selectedBatch.status === "reviewing" && (
					<form action={cancelImportBatch}>
						<input name="batchId" type="hidden" value={selectedBatch.id} />
						<SubmitButton
							className="px-3"
							pendingLabel="Cancelando..."
							variant="danger"
						>
							Descartar lote
						</SubmitButton>
					</form>
				)}
				{selectedBatch.status === "confirmed" && (
					<form action={revertImportBatch}>
						<input name="batchId" type="hidden" value={selectedBatch.id} />
						<SubmitButton
							className="px-3"
							pendingLabel="Revertendo..."
							variant="danger"
						>
							Reverter transações
						</SubmitButton>
					</form>
				)}
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<StatChip
					label="Receitas"
					tone="good"
					value={formatMoney(totals.income)}
				/>
				<StatChip
					label="Despesas"
					tone="bad"
					value={formatMoney(totals.expense)}
				/>
				{totals.transfer > 0 ? (
					<StatChip
						label="Transferências"
						tone="info"
						value={formatMoney(totals.transfer)}
					/>
				) : null}
				{totals.invalid > 0 ? (
					<StatChip label="Inválidas" tone="bad" value={totals.invalid} />
				) : null}
				{totals.duplicates > 0 ? (
					<StatChip label="Duplicadas" tone="warn" value={totals.duplicates} />
				) : null}
				{totals.ignored > 0 ? (
					<StatChip label="Ignoradas" value={totals.ignored} />
				) : null}
				{selectedBatch.suggestionCount > 0 ? (
					<StatChip
						label="Sugestões"
						tone="info"
						value={`${selectedBatch.suggestionCount} (${selectedBatch.suggestionAcceptedCount} aceitas)`}
					/>
				) : null}
			</div>

			{selectedBatch.status === "reviewing" ? (
				<ConfirmImportForm
					accounts={reviewAccounts.map((account) => ({
						id: account.id,
						name: account.name,
					}))}
					batchId={selectedBatch.id}
					categories={reviewCategories.map((category) => ({
						id: category.id,
						name: category.name,
						kind: category.kind,
					}))}
					invalidCount={totals.invalid}
					rows={reviewFormRows}
				/>
			) : (
				<div className="mt-5 grid gap-2 text-sm">
					{rows.map((row) => (
						<p
							className="rounded-xl border border-[color:var(--color-border-subtle)] p-3"
							key={row.id}
						>
							Linha {row.rowNumber}: {rowStatusLabels[row.status] ?? row.status}{" "}
							· {row.originalDescription}
						</p>
					))}
				</div>
			)}
		</>
	);
}

function Panel({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6">
			<h2 className="mb-4 font-semibold text-xl">{title}</h2>
			{children}
		</section>
	);
}

function FieldLabel({
	label,
	children,
	hint,
	wrapperClassName,
}: {
	label: string;
	children: React.ReactNode;
	hint?: string;
	wrapperClassName?: string;
}) {
	return (
		<div
			className={`grid gap-1 text-[color:var(--color-text-muted)] text-sm ${wrapperClassName ?? ""}`}
		>
			<span>{label}</span>
			{children}
			{hint ? (
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					{hint}
				</span>
			) : null}
		</div>
	);
}

function LabelledInput({
	label,
	hint,
	wrapperClassName,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	hint?: string;
	wrapperClassName?: string;
}) {
	return (
		<label
			className={`grid gap-1 text-[color:var(--color-text-muted)] text-sm ${wrapperClassName ?? ""}`}
		>
			<span>{label}</span>
			<input className={inputClass} {...props} />
			{hint ? (
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					{hint}
				</span>
			) : null}
		</label>
	);
}

function LabelledSelect({
	label,
	name,
	options,
	defaultValue,
	hint,
	wrapperClassName,
	required,
}: {
	name: string;
	options: Record<string, string>;
	defaultValue?: string;
	label: string;
	hint?: string;
	wrapperClassName?: string;
	required?: boolean;
}) {
	return (
		<label
			className={`grid gap-1 text-[color:var(--color-text-muted)] text-sm ${wrapperClassName ?? ""}`}
		>
			<span>{label}</span>
			<select
				className={inputClass}
				defaultValue={defaultValue}
				name={name}
				required={required}
			>
				{Object.entries(options).map(([value, optionLabel]) => (
					<option key={value} value={value}>
						{optionLabel}
					</option>
				))}
			</select>
			{hint ? (
				<span className="text-[color:var(--color-text-subtle)] text-xs">
					{hint}
				</span>
			) : null}
		</label>
	);
}

const rowStatusLabels: Record<string, string> = {
	pending_review: "aguardando revis\u00e3o",
	valid: "v\u00e1lida",
	invalid: "inv\u00e1lida",
	ignored: "ignorada",
	duplicate: "duplicada",
	imported: "importada",
};

const movementTypeLabels: Record<string, string> = {
	income: "receita",
	expense: "despesa",
	transfer: "transfer\u00eancia",
};

function StatChip({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: React.ReactNode;
	tone?: "default" | "good" | "bad" | "warn" | "info";
}) {
	const toneClass = {
		default:
			"border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] text-[color:var(--color-text)]",
		good: "border-[color:var(--color-good-border)] bg-[color:var(--color-good-bg)] text-[color:var(--color-good)]",
		bad: "border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] text-[color:var(--color-bad)]",
		warn: "border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
		info: "border-[color:var(--color-info-border)] bg-[color:var(--color-info-bg)] text-[color:var(--color-info)]",
	}[tone];
	return (
		<span
			className={`inline-flex items-baseline gap-2 rounded-full border px-3 py-1 text-xs ${toneClass}`}
		>
			<span className="opacity-80">{label}</span>
			<span className="font-semibold">{value}</span>
		</span>
	);
}

function rowHadSensitiveData(parsedData: unknown) {
	return (
		typeof parsedData === "object" &&
		parsedData !== null &&
		"hadSensitiveData" in parsedData &&
		parsedData.hadSensitiveData === true
	);
}

function formatMoney(cents: number) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(cents / 100);
}

function formatDateTime(date: Date) {
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}
