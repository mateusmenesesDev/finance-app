"use client";

import { useActionState, useMemo, useState } from "react";

import {
	type ConfirmImportBatchState,
	confirmImportBatch,
} from "~/app/_actions/finance-actions";
import { SubmitButton } from "~/app/_components/pending-submit-button";
import { formatMoney, formatMoneyInput } from "~/lib/formatters";

type MovementType = "income" | "expense";

export type ConfirmFormCategory = {
	id: number;
	name: string;
	kind: MovementType;
};

export type ConfirmFormAccount = {
	id: number;
	name: string;
};

export type ConfirmFormRow = {
	id: number;
	rowNumber: number;
	status: string;
	occurredOn: string | null;
	amountCents: number | null;
	movementType: MovementType | null;
	accountId: number;
	originalDescription: string | null;
	bankCategory: string | null;
	parsedData: unknown;
	hadSensitiveData: boolean;
	validationError: string | null;
	suggestedCategoryId: number | null;
	suggestedCategoryName: string | null;
	suggestedRuleDescription: string | null;
	suggestedDescription: string | null;
	suggestionSource: string | null;
	suggestedRecurrenceId: number | null;
	suggestedRecurrenceOccurrenceOn: string | null;
	suggestedRecurrenceName: string | null;
};

type Props = {
	batchId: number;
	rows: ConfirmFormRow[];
	accounts: ConfirmFormAccount[];
	categories: ConfirmFormCategory[];
	invalidCount: number;
};

const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]";

const movementTypeLabels: Record<MovementType, string> = {
	income: "receita",
	expense: "despesa",
};

const rowStatusLabels: Record<string, string> = {
	pending_review: "aguardando revisão",
	valid: "válida",
	invalid: "inválida",
	ignored: "ignorada",
	duplicate: "duplicada",
	imported: "importada",
};

export function ConfirmImportForm({
	batchId,
	rows,
	accounts,
	categories,
	invalidCount,
}: Props) {
	const categoriesById = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);
	const initialRowStates = useMemo(() => {
		const map: Record<number, RowState> = {};
		for (const row of rows) {
			const movementType: MovementType = row.movementType ?? "expense";
			const suggested = row.suggestedCategoryId
				? categoriesById.get(row.suggestedCategoryId)
				: null;
			const categoryId =
				suggested && suggested.kind === movementType
					? String(suggested.id)
					: "";
			map[row.id] = { movementType, categoryId };
		}
		return map;
	}, [rows, categoriesById]);

	const [state, action] = useActionState(
		confirmImportBatch,
		initialConfirmState,
	);
	const [bulkCategoryId, setBulkCategoryId] = useState("");
	const [rowStates, setRowStates] =
		useState<Record<number, RowState>>(initialRowStates);

	const bulkCategory = bulkCategoryId
		? (categoriesById.get(Number(bulkCategoryId)) ?? null)
		: null;
	const bulkIncompatibleCount = bulkCategory
		? rows.filter((row) => {
				const current = rowStates[row.id];
				return (
					current &&
					!current.categoryId &&
					current.movementType !== bulkCategory.kind
				);
			}).length
		: 0;

	function updateRow(rowId: number, patch: Partial<RowState>) {
		setRowStates((prev) => {
			const current = prev[rowId];
			if (!current) return prev;
			let next: RowState = { ...current, ...patch };
			if (patch.movementType && patch.movementType !== current.movementType) {
				// Drop a category whose kind no longer matches the new Tipo.
				const selected = next.categoryId
					? categoriesById.get(Number(next.categoryId))
					: null;
				if (!selected || selected.kind !== next.movementType)
					next = { ...next, categoryId: "" };
			}
			return { ...prev, [rowId]: next };
		});
	}

	return (
		<form action={action} className="mt-5 grid gap-4">
			<input name="batchId" type="hidden" value={batchId} />

			<div className="rounded-2xl border border-[color:var(--color-border-subtle)] p-4">
				<label className="grid gap-2 text-[color:var(--color-text-muted)] text-sm sm:grid-cols-[1fr_2fr] sm:items-center">
					<span>Aplicar uma categoria em todas as linhas sem categoria</span>
					<select
						className={inputClass}
						name="bulkCategoryId"
						onChange={(event) => setBulkCategoryId(event.target.value)}
						value={bulkCategoryId}
					>
						<option value="">Não aplicar em lote</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name} · {movementTypeLabels[category.kind]}
							</option>
						))}
					</select>
				</label>
				<p className="mt-2 text-[color:var(--color-text-subtle)] text-xs">
					Linhas que você já escolheu categoria individual ficam intactas. O
					lote só preenche linhas cujo tipo coincide com a categoria escolhida.
				</p>
				{bulkCategory && bulkIncompatibleCount > 0 && (
					<p className="mt-2 text-[color:var(--color-warn)] text-sm">
						{bulkIncompatibleCount} linha(s) sem categoria têm tipo diferente de
						“{bulkCategory.name}” ({movementTypeLabels[bulkCategory.kind]}) e
						não serão preenchidas pelo lote — escolha uma categoria por linha ou
						troque o lote.
					</p>
				)}
			</div>

			{invalidCount > 0 && (
				<div className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-4 text-[color:var(--color-bad)] text-sm">
					<p className="font-medium">
						{invalidCount} linha(s) inválida(s) marcadas como ignoradas por
						padrão.
					</p>
					<p className="mt-1">
						Compare “Valores lidos do CSV” com o cabeçalho. Se data, valor ou
						descrição vierem vazios ou trocados, ajuste o modelo e envie o CSV
						de novo. Se for um caso isolado, corrija a linha aqui ou mantenha
						como ignorada.
					</p>
				</div>
			)}

			{state.globalError && (
				<div
					className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-4 text-[color:var(--color-bad)] text-sm"
					role="alert"
				>
					<p className="font-medium">{state.globalError}</p>
					<p className="mt-1">
						Nenhuma linha foi importada. Ajuste os campos destacados abaixo e
						confirme novamente.
					</p>
				</div>
			)}

			{rows.map((row) => (
				<RowBlock
					accounts={accounts}
					bulkCategory={bulkCategory}
					categories={categories}
					error={state.rowErrors[row.id] ?? null}
					key={row.id}
					onChange={(patch) => updateRow(row.id, patch)}
					row={row}
					state={rowStates[row.id]}
				/>
			))}

			<SubmitButton
				className="bg-[color:var(--color-accent)] py-3 font-semibold"
				pendingLabel="Confirmando..."
			>
				Confirmar decisões do lote
			</SubmitButton>
		</form>
	);
}

type RowState = { movementType: MovementType; categoryId: string };

const initialConfirmState: ConfirmImportBatchState = {
	rowErrors: {},
	globalError: null,
};

function RowBlock({
	row,
	state,
	accounts,
	categories,
	bulkCategory,
	error,
	onChange,
}: {
	row: ConfirmFormRow;
	state: RowState | undefined;
	accounts: ConfirmFormAccount[];
	categories: ConfirmFormCategory[];
	bulkCategory: ConfirmFormCategory | null;
	error: string | null;
	onChange: (patch: Partial<RowState>) => void;
}) {
	if (!state) return null;
	const movementType = state.movementType;
	const filteredCategories = categories.filter(
		(category) => category.kind === movementType,
	);
	const categoryErrorId = error ? `row-${row.id}-category-error` : undefined;
	const isIgnoreSuggestion = row.suggestionSource === "rule_ignore";
	const suggestionVisible =
		row.suggestedCategoryId &&
		row.suggestedCategoryName &&
		categories.find((category) => category.id === row.suggestedCategoryId)
			?.kind === movementType;
	const bulkWillApply =
		bulkCategory && !state.categoryId && bulkCategory.kind === movementType;
	const bulkWillSkip =
		bulkCategory && !state.categoryId && bulkCategory.kind !== movementType;

	return (
		<div className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4">
			<div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
				<RowFact label="Linha" value={row.rowNumber} />
				<RowFact label="Data" value={row.occurredOn ?? "sem data"} />
				<RowFact label="Valor" value={formatMoney(row.amountCents ?? 0)} />
				<RowFact
					label="Tipo"
					value={
						row.movementType
							? (movementTypeLabels[row.movementType] ?? row.movementType)
							: "não detectado"
					}
				/>
				<RowFact
					className={rowStatusClass(row.status)}
					label="Status"
					value={rowStatusLabels[row.status] ?? row.status}
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
			{row.hadSensitiveData && (
				<p className="text-[color:var(--color-warn)] text-sm">
					Dados sensíveis (CPF, cartão, etc.) detectados e mascarados antes de
					salvar.
				</p>
			)}
			{isIgnoreSuggestion ? (
				<p className="text-[color:var(--color-warn)] text-sm">
					Sugestão: ignorar esta linha
					{row.suggestedRuleDescription
						? ` — a partir da regra “${row.suggestedRuleDescription}”`
						: ""}
				</p>
			) : suggestionVisible ? (
				<p className="text-[color:var(--color-accent)] text-sm">
					Sugestão de categoria: <strong>{row.suggestedCategoryName}</strong>
					{row.suggestedRuleDescription
						? ` — a partir da regra “${row.suggestedRuleDescription}”`
						: ""}
				</p>
			) : null}
			{!isIgnoreSuggestion &&
				row.suggestedRecurrenceId &&
				row.suggestedRecurrenceOccurrenceOn && (
					<p className="text-[color:var(--color-info)] text-sm">
						Parece ser a recorrência{" "}
						<strong>
							{row.suggestedRecurrenceName ?? `#${row.suggestedRecurrenceId}`}
						</strong>{" "}
						(vencimento {row.suggestedRecurrenceOccurrenceOn}).
					</p>
				)}
			{row.validationError && (
				<div className="rounded-xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-3 text-sm">
					<p className="font-medium text-[color:var(--color-bad)]">
						Problema na linha: {row.validationError}
					</p>
					<p className="mt-1 text-[color:var(--color-bad)]">
						{actionableImportError(row.validationError)}
					</p>
				</div>
			)}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				<FieldLabel
					hint="Pré-selecionado pelo status/regra; ajuste se necessário."
					label="O que fazer com esta linha"
				>
					<select
						className={inputClass}
						defaultValue={defaultDecisionFor(row.status, row.suggestionSource)}
						name={`row-${row.id}-decision`}
						required
					>
						<option value="import">Importar (criar transação)</option>
						<option value="duplicate">Marcar como duplicada</option>
						<option value="ignore">Ignorar linha</option>
					</select>
				</FieldLabel>
				<FieldLabel label="Data">
					<input
						className={inputClass}
						defaultValue={row.occurredOn ?? ""}
						name={`row-${row.id}-occurredOn`}
						type="date"
					/>
				</FieldLabel>
				<FieldLabel label="Valor">
					<input
						className={inputClass}
						defaultValue={
							row.amountCents ? formatMoneyInput(row.amountCents) : ""
						}
						name={`row-${row.id}-amount`}
						placeholder="Ex.: 49,90"
					/>
				</FieldLabel>
				<FieldLabel label="Tipo">
					<select
						className={inputClass}
						name={`row-${row.id}-movementType`}
						onChange={(event) =>
							onChange({ movementType: event.target.value as MovementType })
						}
						value={movementType}
					>
						<option value="income">Receita</option>
						<option value="expense">Despesa</option>
					</select>
				</FieldLabel>
				<FieldLabel label="Conta">
					<select
						className={inputClass}
						defaultValue={row.accountId}
						name={`row-${row.id}-accountId`}
					>
						{accounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
				</FieldLabel>
				<FieldLabel
					hint={
						bulkWillApply
							? `Em branco usa o lote: ${bulkCategory.name}.`
							: bulkWillSkip
								? `Lote (${bulkCategory.name}) não compatível; escolha uma categoria de ${movementTypeLabels[movementType]}.`
								: "Obrigatória quando você importar a linha."
					}
					label="Categoria"
				>
					<select
						aria-describedby={categoryErrorId}
						aria-invalid={error ? true : undefined}
						className={inputClass}
						name={`row-${row.id}-categoryId`}
						onChange={(event) => onChange({ categoryId: event.target.value })}
						value={state.categoryId}
					>
						<option value="">Sem categoria</option>
						{filteredCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name} · {movementTypeLabels[category.kind]}
							</option>
						))}
					</select>
				</FieldLabel>
				<FieldLabel
					hint={
						row.suggestedDescription
							? "Vindo da regra de categorização. Edite se quiser."
							: undefined
					}
					label="Descrição final"
					wrapperClassName="sm:col-span-2 lg:col-span-3 xl:col-span-4"
				>
					<input
						className={inputClass}
						defaultValue={
							row.suggestedDescription ?? row.originalDescription ?? ""
						}
						name={`row-${row.id}-description`}
					/>
				</FieldLabel>
			</div>
			{error && (
				<p
					className="rounded-xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-bad-bg)] p-3 text-[color:var(--color-bad)] text-sm"
					id={categoryErrorId}
					role="alert"
				>
					{error}
				</p>
			)}
			{!isIgnoreSuggestion &&
				row.suggestedRecurrenceId &&
				suggestionVisible && (
					<label className="flex items-center gap-2 text-[color:var(--color-info)] text-sm">
						<input
							defaultChecked
							name={`row-${row.id}-acceptRecurrence`}
							type="checkbox"
						/>{" "}
						Confirmar como ocorrência desta recorrência
					</label>
				)}
			<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
				<input name={`row-${row.id}-createRule`} type="checkbox" /> Salvar a
				decisão desta linha como nova regra (categorizar se importar; ignorar se
				marcar como ignorar). Aplica em lotes futuros.
			</label>
		</div>
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
		<details className="rounded-xl border border-[color:var(--color-border-subtle)] p-3 text-sm">
			<summary className="cursor-pointer font-medium text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
				Valores lidos direto do CSV
			</summary>
			<dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
				Compare com a coluna esperada no modelo. Valor estranho aqui geralmente
				significa coluna trocada.
			</p>
		</details>
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

function defaultDecisionFor(status: string, suggestionSource: string | null) {
	if (suggestionSource === "rule_ignore") return "ignore";
	if (status === "duplicate") return "duplicate";
	if (status === "invalid" || status === "ignored") return "ignore";
	return "import";
}

function actionableImportError(error: string) {
	const lower = error.toLowerCase();
	if (lower.includes("data"))
		return "Confira a coluna de data e o formato (dd/mm/aaaa, etc.) no modelo.";
	if (lower.includes("valor") || lower.includes("amount"))
		return "Confira o separador decimal, o sinal do valor e as colunas de entrada/saída.";
	if (lower.includes("descr"))
		return "Confira se a coluna de descrição existe no CSV e não veio vazia.";
	if (lower.includes("duplic"))
		return "Marque como duplicada ou ajuste o identificador externo antes de importar.";
	return "Ajuste os campos abaixo ou marque como ignorada antes de confirmar.";
}
