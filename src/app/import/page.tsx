import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	archiveImportCategoryRule,
	archiveImportTemplate,
	cancelImportBatch,
	confirmImportBatch,
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
				<ul className="list-disc space-y-1 pl-5 text-[color:var(--color-text-muted)] text-sm">
					<li>
						Os campos do modelo são nomes de colunas do cabeçalho do CSV, não a
						posição delas. Copie exatamente como aparece no arquivo.
					</li>
					<li>Exemplo comum: Data, Valor, Identificador e Descrição.</li>
					<li>
						Valores podem vir em coluna única com sinal ou em colunas separadas
						de entrada e saída.
					</li>
					<li>
						Revise linhas inválidas ou duplicadas antes de confirmar; o arquivo
						bruto não é armazenado. A prévia mostra os valores lidos para
						revelar erros de mapeamento.
					</li>
				</ul>
				<Link
					className="mt-3 inline-block text-[color:var(--color-accent)] text-sm hover:underline"
					href="/import/help"
				>
					Abrir guia completo de exportação CSV
				</Link>
			</Panel>

			<section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
				<Panel title="Novo modelo reutilizável">
					<details>
						<summary className="cursor-pointer rounded-2xl border border-[color:var(--color-border)] px-4 py-3 font-medium text-sm hover:bg-[color:var(--color-surface-muted)]">
							Abrir configuração de modelo
						</summary>
						<form action={createImportTemplate} className="mt-4 grid gap-4">
							<div className="rounded-2xl border border-[color:var(--color-warn-border)] bg-[color:var(--color-warn-bg)] p-3 text-[color:var(--color-warn)] text-sm">
								Digite nomes de colunas, não números nem ordem. Ex.: se o
								cabeçalho for “Data;Valor;Identificador;Descrição”, use
								exatamente esses textos.
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								<LabelledInput label="Nome do modelo" name="name" required />
								<LabelledInput
									label="Origem"
									name="sourceLabel"
									placeholder="Banco/cartão"
								/>
								<div className="grid gap-1 text-[color:var(--color-text-muted)] text-sm">
									<span>Formato do valor</span>
									<Select
										defaultValue={defaultTemplateConfig.amountMode}
										name="amountMode"
										options={{
											signed: "Valor único com sinal",
											separate: "Entrada/saída separadas",
										}}
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<h3 className="font-medium text-sm">Mapeamento obrigatório</h3>
								<p className="text-[color:var(--color-text-subtle)] text-xs">
									Data e descrição são sempre necessárias. Para valor, preencha
									“valor único” ou use entrada/saída abaixo.
								</p>
								<div className="grid gap-3 md:grid-cols-3">
									<LabelledInput
										defaultValue={defaultTemplateConfig.dateColumn}
										label="Coluna de data"
										name="dateColumn"
										placeholder="Data"
										required
									/>
									<LabelledInput
										defaultValue={defaultTemplateConfig.descriptionColumn}
										label="Coluna de descrição"
										name="descriptionColumn"
										placeholder="Descrição"
										required
									/>
									<LabelledInput
										defaultValue={defaultTemplateConfig.amountColumn}
										label="Coluna de valor único"
										name="amountColumn"
										placeholder="Valor"
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<h3 className="font-medium text-sm">Mapeamento opcional</h3>
								<div className="grid gap-3 md:grid-cols-4">
									<LabelledInput
										label="Coluna de tipo/sinal"
										name="kindColumn"
										placeholder="Tipo"
									/>
									<LabelledInput
										label="Coluna de entrada"
										name="incomeAmountColumn"
										placeholder="Entrada"
									/>
									<LabelledInput
										label="Coluna de saída"
										name="expenseAmountColumn"
										placeholder="Saída"
									/>
									<LabelledInput
										label="Coluna de categoria"
										name="categoryColumn"
										placeholder="Categoria"
									/>
									<LabelledInput
										label="Coluna de identificador"
										name="externalIdColumn"
										placeholder="Identificador"
									/>
									<LabelledInput
										label="Coluna de observação"
										name="notesColumn"
										placeholder="Observação"
									/>
								</div>
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								<Select
									defaultValue={defaultTemplateConfig.dateFormat}
									name="dateFormat"
									options={{
										"dd/mm/yyyy": "Data dd/mm/aaaa",
										"dd-mm-yyyy": "Data dd-mm-aaaa",
										"yyyy-mm-dd": "Data aaaa-mm-dd",
									}}
								/>
								<Select
									defaultValue={defaultTemplateConfig.delimiter}
									name="delimiter"
									options={{
										auto: "Separador automático",
										",": "Vírgula",
										";": "Ponto e vírgula",
									}}
								/>
								<Select
									defaultValue={defaultTemplateConfig.decimalSeparator}
									name="decimalSeparator"
									options={{
										auto: "Decimal automático",
										",": "Decimal vírgula",
										".": "Decimal ponto",
									}}
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<TextInput
									defaultValue={defaultTemplateConfig.incomeTokens.join(", ")}
									name="incomeTokens"
									placeholder="Tokens de receita"
								/>
								<TextInput
									defaultValue={defaultTemplateConfig.expenseTokens.join(", ")}
									name="expenseTokens"
									placeholder="Tokens de despesa"
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
						<div className="grid gap-3 md:grid-cols-3">
							<select className={inputClass} name="accountId" required>
								<option value="">Conta fixa do lote</option>
								{usableAccounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.name}
									</option>
								))}
							</select>
							<select className={inputClass} name="templateId" required>
								<option value="">Modelo salvo</option>
								{activeTemplates.map((template) => (
									<option key={template.id} value={template.id}>
										{template.name}
									</option>
								))}
							</select>
							<input
								accept=".csv,text/csv"
								className={inputClass}
								name="csvFile"
								required
								type="file"
							/>
						</div>
						<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
							<input disabled name="rawFileStored" type="checkbox" /> Armazenar
							arquivo bruto (desativado nesta versão)
						</label>
						<p className="text-[color:var(--color-text-muted)] text-sm">
							Controle explícito: o arquivo bruto não é salvo. Apenas linhas
							parseadas e mascaradas ficam no lote para revisão.
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
								Crie um modelo antes de enviar CSV.
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

			<section className="grid gap-6 xl:grid-cols-[0.35fr_0.65fr]">
				<Panel title="Histórico de lotes">
					<div className="grid gap-2">
						{batches.map((batch) => (
							<Link
								className={`rounded-2xl border p-4 text-sm ${selectedBatch?.id === batch.id ? "border-[color:var(--color-good-border)] bg-[color:var(--color-good-bg)]" : "border-[color:var(--color-border-subtle)]"}`}
								href={`/import?batchId=${batch.id}`}
								key={batch.id}
							>
								<p className="font-medium">
									#{batch.id} {batch.originalFileName}
								</p>
								<p className="text-[color:var(--color-text-muted)]">
									{formatDateTime(batch.createdAt)} ·{" "}
									{statusLabels[batch.status]} · {batch.rowCount} linhas
								</p>
								<p className="text-[color:var(--color-text-muted)]">
									Conta: {accountById.get(batch.accountId)?.name ?? "conta"} ·{" "}
									Usuário:{" "}
									{session.user.email ?? session.user.name ?? session.user.id}
								</p>
								<p className="text-[color:var(--color-text-subtle)]">
									Arquivo bruto:{" "}
									{batch.rawFileStored ? "armazenado" : "não armazenado"} ·
									Modelo:{" "}
									{batch.importTemplateId
										? (templateById.get(batch.importTemplateId)?.name ??
											"arquivado")
										: "—"}
								</p>
							</Link>
						))}
						{batches.length === 0 && (
							<p className="text-[color:var(--color-text-muted)]">
								Nenhum lote ainda.
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
						<p className="text-[color:var(--color-text-muted)]">
							Selecione ou crie um lote.
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
				<form action={updateImportTemplate} className="mt-3 grid gap-3">
					<input name="id" type="hidden" value={template.id} />
					<div className="grid gap-3 md:grid-cols-3">
						<TextInput defaultValue={template.name} name="name" required />
						<TextInput
							defaultValue={template.sourceLabel ?? ""}
							name="sourceLabel"
							placeholder="Banco/cartão"
						/>
						<Select
							defaultValue={config.amountMode}
							name="amountMode"
							options={{ signed: "Valor único", separate: "Entrada/saída" }}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-4">
						<TextInput
							defaultValue={config.dateColumn}
							name="dateColumn"
							required
						/>
						<TextInput
							defaultValue={config.descriptionColumn}
							name="descriptionColumn"
							required
						/>
						<TextInput
							defaultValue={config.amountColumn ?? ""}
							name="amountColumn"
						/>
						<TextInput
							defaultValue={config.kindColumn ?? ""}
							name="kindColumn"
						/>
						<TextInput
							defaultValue={config.incomeAmountColumn ?? ""}
							name="incomeAmountColumn"
						/>
						<TextInput
							defaultValue={config.expenseAmountColumn ?? ""}
							name="expenseAmountColumn"
						/>
						<TextInput
							defaultValue={config.categoryColumn ?? ""}
							name="categoryColumn"
						/>
						<TextInput
							defaultValue={config.externalIdColumn ?? ""}
							name="externalIdColumn"
						/>
						<TextInput
							defaultValue={config.notesColumn ?? ""}
							name="notesColumn"
						/>
						<Select
							defaultValue={config.dateFormat}
							name="dateFormat"
							options={{
								"dd/mm/yyyy": "dd/mm/aaaa",
								"dd-mm-yyyy": "dd-mm-aaaa",
								"yyyy-mm-dd": "aaaa-mm-dd",
							}}
						/>
						<Select
							defaultValue={config.delimiter}
							name="delimiter"
							options={{
								auto: "Separador automático",
								",": "Vírgula",
								";": "Ponto e vírgula",
							}}
						/>
						<Select
							defaultValue={config.decimalSeparator}
							name="decimalSeparator"
							options={{
								auto: "Decimal automático",
								",": "Decimal vírgula",
								".": "Decimal ponto",
							}}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<TextInput
							defaultValue={config.incomeTokens.join(", ")}
							name="incomeTokens"
						/>
						<TextInput
							defaultValue={config.expenseTokens.join(", ")}
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
			<form
				action={createImportCategoryRule}
				className="grid gap-3 md:grid-cols-6"
			>
				<TextInput
					className={`${inputClass} md:col-span-2`}
					name="description"
					placeholder="Texto normalizado/estabelecimento"
					required
				/>
				<Select
					defaultValue="contains"
					name="textMatchMode"
					options={{ contains: "Contém", exact: "Exato" }}
				/>
				<Select
					defaultValue="expense"
					name="movementType"
					options={{ expense: "Despesa", income: "Receita" }}
				/>
				<TextInput name="amount" placeholder="Valor aprox. opcional" />
				<TextInput name="amountTolerance" placeholder="Tolerância opcional" />
				<TextInput name="priority" placeholder="Prioridade" />
				<select className={inputClass} name="accountId">
					<option value="">Qualquer conta</option>
					{ruleAccounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
				<select
					className={`${inputClass} md:col-span-2`}
					name="categoryId"
					required
				>
					<option value="">Categoria ativa e compatível</option>
					{ruleCategories.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name} ·{" "}
							{category.kind === "income" ? "receita" : "despesa"}
						</option>
					))}
				</select>
				<SubmitButton
					className="bg-[color:var(--color-accent)] font-semibold md:col-span-2"
					pendingLabel="Criando..."
				>
					Criar regra
				</SubmitButton>
			</form>
			<div className="mt-4 grid gap-2">
				{activeRules.map((rule) => {
					const category = categoryById.get(rule.categoryId);
					const account = rule.accountId
						? accountById.get(rule.accountId)
						: null;
					return (
						<div
							className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-3 text-sm"
							key={rule.id}
						>
							<p>
								<span className="font-medium">
									{rule.normalizedDescription}
								</span>{" "}
								· {rule.textMatchMode} · {rule.movementType} ·{" "}
								{account?.name ?? "qualquer conta"} ·{" "}
								{category?.name ?? "categoria arquivada"} · prioridade{" "}
								{rule.priority} · sugeriu {rule.matchCount} · auto categorizou{" "}
								{rule.acceptedCount} · rejeitou {rule.rejectedCount}
							</p>
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
						Sem regras ativas.
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
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[color:var(--color-text-muted)] text-sm">
						{selectedBatch.originalFileName} · arquivo bruto armazenado:{" "}
						{selectedBatch.rawFileStored ? "sim" : "não"}
					</p>
					<p className="mt-2 text-[color:var(--color-text-muted)] text-sm">
						Prévia normalizada: Receitas {formatMoney(totals.income)} · Despesas{" "}
						{formatMoney(totals.expense)} · Transferências{" "}
						{formatMoney(totals.transfer)} · Ignoradas {totals.ignored} ·
						Duplicadas {totals.duplicates} · Inválidas {totals.invalid} ·
						Sugestões {selectedBatch.suggestionCount} (auto categorizadas{" "}
						{selectedBatch.suggestionAcceptedCount}, rejeitadas{" "}
						{selectedBatch.suggestionRejectedCount}, alteradas{" "}
						{selectedBatch.suggestionOverriddenCount})
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
							Cancelar lote
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

			{selectedBatch.status === "reviewing" ? (
				<form action={confirmImportBatch} className="mt-5 grid gap-3">
					<input name="batchId" type="hidden" value={selectedBatch.id} />
					<div className="rounded-2xl border border-[color:var(--color-border-subtle)] p-4">
						<label className="grid gap-2 text-[color:var(--color-text-muted)] text-sm md:grid-cols-[220px_1fr] md:items-center">
							Aplicar categoria em lote
							<select className={inputClass} name="bulkCategoryId">
								<option value="">Não aplicar</option>
								{reviewCategories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name} ·{" "}
										{category.kind === "income" ? "receita" : "despesa"}
									</option>
								))}
							</select>
						</label>
						<p className="mt-2 text-[color:var(--color-text-subtle)] text-xs">
							Usada apenas em linhas importadas sem categoria individual.
						</p>
					</div>
					{totals.invalid > 0 && (
						<div className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-4 text-[color:var(--color-bad)] text-sm">
							<p className="font-medium">
								{totals.invalid} linha(s) inválida(s) precisam de decisão.
							</p>
							<p className="mt-1">
								Compare “Valores lidos do CSV” com o cabeçalho. Se data, valor
								ou descrição vierem vazios/trocados, ajuste o modelo e envie o
								CSV novamente; se for uma exceção, corrija a linha ou ignore.
							</p>
						</div>
					)}
					{rows.map((row) => (
						<div
							className="grid gap-2 rounded-2xl border border-[color:var(--color-border-subtle)] p-4"
							key={row.id}
						>
							<div className="grid gap-2 text-sm md:grid-cols-5">
								<RowFact label="Linha" value={row.rowNumber} />
								<RowFact
									label="Data normalizada"
									value={row.occurredOn ?? "sem data"}
								/>
								<RowFact
									label="Valor"
									value={formatMoney(row.amountCents ?? 0)}
								/>
								<RowFact label="Tipo" value={row.movementType ?? "tipo?"} />
								<RowFact
									className={rowStatusClass(row.status)}
									label="Status"
									value={row.status}
								/>
							</div>
							<div className="rounded-xl bg-[color:var(--color-surface-muted)] p-3 text-sm">
								<p className="text-[color:var(--color-text-muted)] text-xs">
									Descrição importada
								</p>
								<p className="text-[color:var(--color-text)]">
									{row.originalDescription || "sem descrição"}
								</p>
							</div>
							<ParsedDataPreview parsedData={row.parsedData} />
							{row.bankCategory && (
								<p className="text-[color:var(--color-text-muted)] text-sm">
									Categoria do banco: {row.bankCategory}
								</p>
							)}
							{rowHadSensitiveData(row.parsedData) && (
								<p className="text-[color:var(--color-warn)] text-sm">
									Dados sensíveis detectados e mascarados antes de salvar.
								</p>
							)}
							{row.suggestedCategoryId && (
								<p className="text-[color:var(--color-accent)] text-sm">
									Sugestão:{" "}
									{reviewCategories.find(
										(category) => category.id === row.suggestedCategoryId,
									)?.name ?? "categoria"}{" "}
									· regra #{row.suggestedRuleId}:{" "}
									{row.suggestedRuleId
										? ruleById.get(row.suggestedRuleId)?.normalizedDescription
										: ""}
								</p>
							)}
							{row.suggestedRecurrenceId &&
								row.suggestedRecurrenceOccurrenceOn && (
									<p className="text-[color:var(--color-info)] text-sm">
										Sugestão: recorrência{" "}
										{recurrenceById.get(row.suggestedRecurrenceId)?.name ??
											`#${row.suggestedRecurrenceId}`}{" "}
										(vencimento {row.suggestedRecurrenceOccurrenceOn})
									</p>
								)}
							{row.validationError && (
								<div className="rounded-xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-3 text-sm">
									<p className="font-medium text-[color:var(--color-bad)]">
										Erro da linha: {row.validationError}
									</p>
									<p className="mt-1 text-[color:var(--color-bad)]">
										{actionableImportError(row.validationError)}
									</p>
								</div>
							)}
							<div className="grid gap-2 md:grid-cols-7">
								<select
									className={inputClass}
									defaultValue={row.status === "invalid" ? "ignore" : ""}
									name={`row-${row.id}-decision`}
									required
								>
									<option value="">Decisão explícita</option>
									<option value="import">Importar</option>
									<option value="duplicate">Duplicada</option>
									<option value="ignore">Ignorar</option>
								</select>
								<input
									className={inputClass}
									defaultValue={row.occurredOn ?? ""}
									name={`row-${row.id}-occurredOn`}
									type="date"
								/>
								<input
									className={inputClass}
									defaultValue={
										row.amountCents ? formatMoneyInput(row.amountCents) : ""
									}
									name={`row-${row.id}-amount`}
									placeholder="Valor"
								/>
								<select
									className={inputClass}
									defaultValue={row.movementType ?? "expense"}
									name={`row-${row.id}-movementType`}
								>
									<option value="income">Receita</option>
									<option value="expense">Despesa</option>
								</select>
								<select
									className={inputClass}
									defaultValue={row.accountId}
									name={`row-${row.id}-accountId`}
								>
									{reviewAccounts.map((account) => (
										<option key={account.id} value={account.id}>
											{account.name}
										</option>
									))}
								</select>
								<select
									className={inputClass}
									defaultValue={row.suggestedCategoryId ?? ""}
									name={`row-${row.id}-categoryId`}
								>
									<option value="">Categoria obrigatória ao importar</option>
									{reviewCategories.map((category) => (
										<option key={category.id} value={category.id}>
											{category.name} ·{" "}
											{category.kind === "income" ? "receita" : "despesa"}
										</option>
									))}
								</select>
								<input
									className={inputClass}
									defaultValue={row.originalDescription ?? ""}
									name={`row-${row.id}-description`}
								/>
							</div>
							{row.suggestedRecurrenceId && (
								<label className="flex items-center gap-2 text-[color:var(--color-info)] text-sm">
									<input
										defaultChecked
										name={`row-${row.id}-acceptRecurrence`}
										type="checkbox"
									/>{" "}
									Vincular recorrência sugerida ao importar
								</label>
							)}
							<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
								<input name={`row-${row.id}-createRule`} type="checkbox" />{" "}
								Criar regra a partir desta correção
							</label>
						</div>
					))}
					<SubmitButton
						className="bg-[color:var(--color-accent)] py-3 font-semibold"
						pendingLabel="Confirmando..."
					>
						Confirmar decisões do lote
					</SubmitButton>
				</form>
			) : (
				<div className="mt-5 grid gap-2 text-sm">
					{rows.map((row) => (
						<p
							className="rounded-xl border border-[color:var(--color-border-subtle)] p-3"
							key={row.id}
						>
							Linha {row.rowNumber}: {row.status} · {row.originalDescription}
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

function Select({
	name,
	options,
	defaultValue,
}: {
	name: string;
	options: Record<string, string>;
	defaultValue?: string;
}) {
	return (
		<select className={inputClass} defaultValue={defaultValue} name={name}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input className={inputClass} {...props} />;
}

function LabelledInput({
	label,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
	return (
		<label className="grid gap-1 text-[color:var(--color-text-muted)] text-sm">
			{label}
			<input className={inputClass} {...props} />
		</label>
	);
}

function RowFact({
	label,
	value,
	className,
}: {
	label: string;
	value: React.ReactNode;
	className?: string;
}) {
	return (
		<div>
			<p className="text-[color:var(--color-text-muted)] text-xs">{label}</p>
			<p className={className ?? "text-[color:var(--color-text)]"}>{value}</p>
		</div>
	);
}

function ParsedDataPreview({ parsedData }: { parsedData: unknown }) {
	const entries = parsedDataEntries(parsedData).filter(
		([key]) => key !== "hadSensitiveData",
	);
	if (entries.length === 0) return null;

	return (
		<div className="rounded-xl border border-[color:var(--color-border-subtle)] p-3 text-sm">
			<p className="mb-2 font-medium">Valores lidos do CSV</p>
			<dl className="grid gap-2 md:grid-cols-5">
				{entries.map(([key, value]) => (
					<div key={key}>
						<dt className="text-[color:var(--color-text-muted)] text-xs">
							{parsedDataLabel(key)}
						</dt>
						<dd className="break-words text-[color:var(--color-text)]">
							{value || "—"}
						</dd>
					</div>
				))}
			</dl>
			<p className="mt-2 text-[color:var(--color-text-subtle)] text-xs">
				Use estes valores para detectar coluna errada no modelo.
			</p>
		</div>
	);
}

function parsedDataEntries(parsedData: unknown): [string, string][] {
	if (typeof parsedData !== "object" || parsedData === null) return [];
	return Object.entries(parsedData).map(([key, value]) => [
		key,
		value === null || value === undefined ? "" : String(value),
	]);
}

function parsedDataLabel(key: string) {
	const labels: Record<string, string> = {
		date: "Data bruta",
		amount: "Valor bruto",
		kind: "Tipo/sinal bruto",
		notes: "Observação bruta",
	};
	return labels[key] ?? key;
}

function rowStatusClass(status: string) {
	if (status === "duplicate") return "text-[color:var(--color-warn)]";
	if (status === "invalid") return "text-[color:var(--color-bad)]";
	if (status === "imported") return "text-[color:var(--color-accent)]";
	return "text-[color:var(--color-text-muted)]";
}

function actionableImportError(error: string) {
	const lower = error.toLowerCase();
	if (lower.includes("data"))
		return "Confira a coluna de data e o formato escolhido no modelo.";
	if (lower.includes("valor") || lower.includes("amount"))
		return "Confira separador decimal, sinal e colunas de entrada/saída.";
	if (lower.includes("descr"))
		return "Confira se a coluna de descrição existe e tem conteúdo.";
	if (lower.includes("duplic"))
		return "Marque como duplicada ou ajuste o ID externo/descrição antes de importar.";
	return "Ajuste a linha no formulário ou marque como ignorada antes de confirmar.";
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

function formatMoneyInput(cents: number) {
	return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDateTime(date: Date) {
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}
