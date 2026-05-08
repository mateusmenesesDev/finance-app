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
} from "~/server/db/schema";

type ImportPageProps = {
	searchParams?: Promise<{ batchId?: string }>;
};

const inputClass =
	"rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";

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
		<main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
			<div className="mx-auto grid w-full max-w-7xl gap-8">
				<header className="flex items-start justify-between gap-4 border-slate-800 border-b pb-6">
					<div>
						<p className="font-medium text-emerald-300 text-sm uppercase tracking-[0.3em]">
							Importação
						</p>
						<h1 className="mt-2 font-semibold text-3xl">
							Centro de importação CSV
						</h1>
						<p className="mt-2 max-w-3xl text-slate-300">
							MVP seguro: CSV pequeno/médio, uma conta por lote, modelos
							reutilizáveis, revisão manual e sem armazenar arquivo bruto.
						</p>
					</div>
					<Link
						className="rounded-full border border-slate-700 px-4 py-2 text-sm"
						href="/"
					>
						Voltar
					</Link>
				</header>

				<section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
					<Panel title="Novo modelo reutilizável">
						<form action={createImportTemplate} className="grid gap-3">
							<div className="grid gap-3 md:grid-cols-3">
								<TextInput name="name" placeholder="Nome do modelo" required />
								<TextInput name="sourceLabel" placeholder="Banco/cartão" />
								<Select
									defaultValue={defaultTemplateConfig.amountMode}
									name="amountMode"
									options={{
										signed: "Valor único com sinal",
										separate: "Entrada/saída separadas",
									}}
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-4">
								<TextInput
									defaultValue={defaultTemplateConfig.dateColumn}
									name="dateColumn"
									placeholder="Coluna data"
									required
								/>
								<TextInput
									defaultValue={defaultTemplateConfig.descriptionColumn}
									name="descriptionColumn"
									placeholder="Coluna descrição"
									required
								/>
								<TextInput
									defaultValue={defaultTemplateConfig.amountColumn}
									name="amountColumn"
									placeholder="Coluna valor único"
								/>
								<TextInput
									name="kindColumn"
									placeholder="Coluna tipo/sinal opcional"
								/>
								<TextInput
									name="incomeAmountColumn"
									placeholder="Coluna entrada"
								/>
								<TextInput
									name="expenseAmountColumn"
									placeholder="Coluna saída"
								/>
								<TextInput
									name="categoryColumn"
									placeholder="Coluna categoria"
								/>
								<TextInput
									name="externalIdColumn"
									placeholder="Coluna ID externo"
								/>
								<TextInput name="notesColumn" placeholder="Coluna observação" />
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
							<label className="flex items-center gap-2 text-slate-300 text-sm">
								<input name="invertSign" type="checkbox" /> Inverter sinal do
								valor
							</label>
							<button
								className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-slate-950"
								type="submit"
							>
								Salvar modelo
							</button>
						</form>
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
							<label className="flex items-center gap-2 text-slate-400 text-sm">
								<input disabled name="rawFileStored" type="checkbox" />{" "}
								Armazenar arquivo bruto (desativado nesta versão)
							</label>
							<p className="text-slate-400 text-sm">
								Controle explícito: o arquivo bruto não é salvo. Apenas linhas
								parseadas e mascaradas ficam no lote para revisão.
							</p>
							<button
								className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-slate-950"
								type="submit"
							>
								Enviar para revisão
							</button>
						</form>

						<div className="mt-6 grid gap-2">
							<h3 className="font-medium">Modelos salvos</h3>
							{activeTemplates.map((template) => (
								<TemplateCard key={template.id} template={template} />
							))}
							{activeTemplates.length === 0 && (
								<p className="text-slate-400 text-sm">
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
									className={`rounded-2xl border p-4 text-sm ${selectedBatch?.id === batch.id ? "border-emerald-400 bg-emerald-400/10" : "border-slate-800"}`}
									href={`/import?batchId=${batch.id}`}
									key={batch.id}
								>
									<p className="font-medium">
										#{batch.id} {batch.originalFileName}
									</p>
									<p className="text-slate-400">
										{formatDateTime(batch.createdAt)} ·{" "}
										{statusLabels[batch.status]} · {batch.rowCount} linhas
									</p>
									<p className="text-slate-400">
										Conta: {accountById.get(batch.accountId)?.name ?? "conta"} ·{" "}
										Usuário:{" "}
										{session.user.email ?? session.user.name ?? session.user.id}
									</p>
									<p className="text-slate-500">
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
								<p className="text-slate-400">Nenhum lote ainda.</p>
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
								reviewRules={rules}
								rows={rows}
								selectedBatch={selectedBatch}
							/>
						) : (
							<p className="text-slate-400">Selecione ou crie um lote.</p>
						)}
					</Panel>
				</section>
			</div>
		</main>
	);
}

function TemplateCard({
	template,
}: {
	template: typeof importTemplates.$inferSelect;
}) {
	const config = normalizeImportTemplateConfig(template.config);
	return (
		<div className="rounded-2xl border border-slate-800 p-3 text-sm">
			<details>
				<summary className="cursor-pointer list-none">
					<span className="font-medium">{template.name}</span>
					<span className="ml-2 text-slate-400">
						{template.sourceLabel ?? "sem origem"} ·{" "}
						{config.amountMode === "signed" ? "valor único" : "entrada/saída"}
					</span>
					<span className="block text-slate-500">
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
					<label className="flex items-center gap-2 text-slate-300">
						<input
							defaultChecked={config.invertSign}
							name="invertSign"
							type="checkbox"
						/>{" "}
						Inverter sinal
					</label>
					<div className="flex gap-2">
						<button
							className="rounded-xl bg-emerald-400 px-3 py-2 font-semibold text-slate-950"
							type="submit"
						>
							Salvar alterações
						</button>
					</div>
				</form>
				<form action={archiveImportTemplate} className="mt-2">
					<input name="id" type="hidden" value={template.id} />
					<button
						className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200"
						type="submit"
					>
						Arquivar
					</button>
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
				<button
					className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-slate-950 md:col-span-2"
					type="submit"
				>
					Criar regra
				</button>
			</form>
			<div className="mt-4 grid gap-2">
				{activeRules.map((rule) => {
					const category = categoryById.get(rule.categoryId);
					const account = rule.accountId
						? accountById.get(rule.accountId)
						: null;
					return (
						<div
							className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 p-3 text-sm"
							key={rule.id}
						>
							<p>
								<span className="font-medium">
									{rule.normalizedDescription}
								</span>{" "}
								· {rule.textMatchMode} · {rule.movementType} ·{" "}
								{account?.name ?? "qualquer conta"} ·{" "}
								{category?.name ?? "categoria arquivada"} · prioridade{" "}
								{rule.priority}
							</p>
							<form action={archiveImportCategoryRule}>
								<input name="id" type="hidden" value={rule.id} />
								<button
									className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200"
									type="submit"
								>
									Arquivar
								</button>
							</form>
						</div>
					);
				})}
				{activeRules.length === 0 && (
					<p className="text-slate-400 text-sm">Sem regras ativas.</p>
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
}: {
	selectedBatch: typeof importBatches.$inferSelect;
	rows: (typeof importRows.$inferSelect)[];
	reviewAccounts: (typeof financialAccounts.$inferSelect)[];
	reviewCategories: (typeof categories.$inferSelect)[];
	reviewRules: (typeof importCategoryRules.$inferSelect)[];
}) {
	const ruleById = new Map(reviewRules.map((rule) => [rule.id, rule]));
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
					<p className="text-slate-400 text-sm">
						{selectedBatch.originalFileName} · arquivo bruto armazenado:{" "}
						{selectedBatch.rawFileStored ? "sim" : "não"}
					</p>
					<p className="mt-2 text-slate-300 text-sm">
						Prévia normalizada: Receitas {formatMoney(totals.income)} · Despesas{" "}
						{formatMoney(totals.expense)} · Transferências{" "}
						{formatMoney(totals.transfer)} · Ignoradas {totals.ignored} ·
						Duplicadas {totals.duplicates} · Inválidas {totals.invalid} ·
						Sugestões {selectedBatch.suggestionCount} (aceitas{" "}
						{selectedBatch.suggestionAcceptedCount}, alteradas{" "}
						{selectedBatch.suggestionOverriddenCount})
					</p>
				</div>
				{selectedBatch.status === "reviewing" && (
					<form action={cancelImportBatch}>
						<input name="batchId" type="hidden" value={selectedBatch.id} />
						<button
							className="rounded-xl border border-rose-900 px-3 py-2 text-rose-200 text-sm"
							type="submit"
						>
							Cancelar lote
						</button>
					</form>
				)}
				{selectedBatch.status === "confirmed" && (
					<form action={revertImportBatch}>
						<input name="batchId" type="hidden" value={selectedBatch.id} />
						<button
							className="rounded-xl border border-red-400 px-3 py-2 text-red-200 text-sm"
							type="submit"
						>
							Reverter transações
						</button>
					</form>
				)}
			</div>

			{selectedBatch.status === "reviewing" ? (
				<form action={confirmImportBatch} className="mt-5 grid gap-3">
					<input name="batchId" type="hidden" value={selectedBatch.id} />
					<div className="rounded-2xl border border-slate-800 p-4">
						<label className="grid gap-2 text-slate-300 text-sm md:grid-cols-[220px_1fr] md:items-center">
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
						<p className="mt-2 text-slate-500 text-xs">
							Usada apenas em linhas importadas sem categoria individual.
						</p>
					</div>
					{rows.map((row) => (
						<div
							className="grid gap-2 rounded-2xl border border-slate-800 p-4"
							key={row.id}
						>
							<div className="flex flex-wrap gap-3 text-sm">
								<span className="text-slate-400">Linha {row.rowNumber}</span>
								<span>{row.occurredOn ?? "sem data"}</span>
								<span>{formatMoney(row.amountCents ?? 0)}</span>
								<span>{row.movementType ?? "tipo?"}</span>
								<span className={rowStatusClass(row.status)}>{row.status}</span>
							</div>
							<p className="text-slate-200 text-sm">
								{row.originalDescription}
							</p>
							{row.bankCategory && (
								<p className="text-slate-400 text-sm">
									Categoria do banco: {row.bankCategory}
								</p>
							)}
							{rowHadSensitiveData(row.parsedData) && (
								<p className="text-amber-300 text-sm">
									Dados sensíveis detectados e mascarados antes de salvar.
								</p>
							)}
							{row.suggestedCategoryId && (
								<p className="text-emerald-300 text-sm">
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
							{row.validationError && (
								<p className="text-red-300 text-sm">{row.validationError}</p>
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
							<label className="flex items-center gap-2 text-slate-400 text-sm">
								<input name={`row-${row.id}-createRule`} type="checkbox" />{" "}
								Criar regra a partir desta correção
							</label>
						</div>
					))}
					<button
						className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950"
						type="submit"
					>
						Confirmar decisões do lote
					</button>
				</form>
			) : (
				<div className="mt-5 grid gap-2 text-sm">
					{rows.map((row) => (
						<p className="rounded-xl border border-slate-800 p-3" key={row.id}>
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
		<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
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

function rowStatusClass(status: string) {
	if (status === "duplicate") return "text-amber-300";
	if (status === "invalid") return "text-red-300";
	if (status === "imported") return "text-emerald-300";
	return "text-slate-300";
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
