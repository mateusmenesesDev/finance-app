"use client";

import { useActionState, useCallback, useMemo, useState } from "react";

import {
	type ConfirmImportBatchState,
	confirmImportBatch,
} from "~/app/_actions/finance-actions";
import { Money } from "~/components/money";
import { SubmitButton } from "~/components/submit-button";
import { formatMoneyInput } from "~/lib/formatters";

type MovementType = "income" | "expense" | "transfer" | "credit_card_payment";

export type ConfirmFormCategory = {
	id: number;
	name: string;
	kind: "income" | "expense";
};

export type ConfirmFormAccount = {
	id: number;
	name: string;
	type: "checking" | "savings" | "cash" | "credit_card" | "investment";
};

export type ConfirmFormInvoice = {
	id: number;
	cardId: number;
	cardName: string;
	monthKey: string;
	dueDate: string;
};

export type ConfirmFormRow = {
	id: number;
	rowNumber: number;
	status: string;
	occurredOn: string | null;
	amountCents: number | null;
	movementType: MovementType | null;
	accountId: number | null;
	cardId: number | null;
	cardInvoiceId: number | null;
	originalDescription: string | null;
	bankCategory: string | null;
	parsedData: unknown;
	hadSensitiveData: boolean;
	validationError: string | null;
	suggestedCategoryId: number | null;
	suggestedCategoryName: string | null;
	suggestedSourceAccountId: number | null;
	suggestedDestinationAccountId: number | null;
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
	invoices: ConfirmFormInvoice[];
	invalidCount: number;
};

const inputClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const movementTypeLabels: Record<MovementType, string> = {
	income: "receita",
	expense: "despesa",
	transfer: "transferência",
	credit_card_payment: "pagamento de fatura",
};

function isTransferLikeMovement(movementType: MovementType) {
	return movementType === "transfer" || movementType === "credit_card_payment";
}

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
	invoices,
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
			map[row.id] = {
				movementType,
				categoryId,
				sourceAccountId: row.suggestedSourceAccountId
					? String(row.suggestedSourceAccountId)
					: row.accountId
						? String(row.accountId)
						: "",
				destinationAccountId: row.suggestedDestinationAccountId
					? String(row.suggestedDestinationAccountId)
					: "",
				cardInvoiceId: row.cardInvoiceId ? String(row.cardInvoiceId) : "",
				description: row.suggestedDescription ?? row.originalDescription ?? "",
			};
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

	const updateRow = useCallback(
		(rowId: number, patch: Partial<RowState>) => {
			setRowStates((prev) => {
				const current = prev[rowId];
				if (!current) return prev;
				let next: RowState = { ...current, ...patch };
				if (patch.movementType && patch.movementType !== current.movementType) {
					// Drop a category whose kind no longer matches the new Tipo. Note
					// that the only category-bearing kinds are income/expense.
					const selected = next.categoryId
						? categoriesById.get(Number(next.categoryId))
						: null;
					if (
						!selected ||
						(next.movementType !== "income" &&
							next.movementType !== "expense") ||
						selected.kind !== next.movementType
					) {
						next = { ...next, categoryId: "" };
					}
					if (!isTransferLikeMovement(patch.movementType)) {
						next = { ...next, destinationAccountId: "" };
					}
				}
				return { ...prev, [rowId]: next };
			});
		},
		[categoriesById],
	);

	return (
		<form action={action} className="mt-5 grid gap-4">
			<input name="batchId" type="hidden" value={batchId} />

			<div className="rounded-md border border p-4">
				<label className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-[1fr_2fr] sm:items-center">
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
				<p className="mt-2 text-muted-foreground text-xs">
					Linhas que você já escolheu categoria individual ficam intactas. O
					lote só preenche linhas cujo tipo coincide com a categoria escolhida.
				</p>
				{bulkCategory && bulkIncompatibleCount > 0 && (
					<p className="mt-2 text-sm text-warning">
						{bulkIncompatibleCount} linha(s) sem categoria têm tipo diferente de
						“{bulkCategory.name}” ({movementTypeLabels[bulkCategory.kind]}) e
						não serão preenchidas pelo lote — escolha uma categoria por linha ou
						troque o lote.
					</p>
				)}
			</div>

			{invalidCount > 0 && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
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
					className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
					role="alert"
				>
					<p className="font-medium">{state.globalError}</p>
					<p className="mt-1">
						Nenhuma linha foi importada. Ajuste os campos destacados abaixo e
						confirme novamente.
					</p>
				</div>
			)}

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma linha para revisar.
				</p>
			) : (
				<div className="grid gap-4">
					{rows.map((row) => (
						<RowBlock
							accounts={accounts}
							bulkCategory={bulkCategory}
							categories={categories}
							error={state.rowErrors[row.id] ?? null}
							invoices={invoices}
							key={row.id}
							onChange={(patch) => updateRow(row.id, patch)}
							row={row}
							state={rowStates[row.id]}
						/>
					))}
				</div>
			)}

			<SubmitButton
				className="bg-primary py-3 font-semibold"
				pendingLabel="Confirmando..."
			>
				Confirmar decisões do lote
			</SubmitButton>
		</form>
	);
}

type RowState = {
	movementType: MovementType;
	categoryId: string;
	sourceAccountId: string;
	destinationAccountId: string;
	cardInvoiceId: string;
	description: string;
};

const initialConfirmState: ConfirmImportBatchState = {
	rowErrors: {},
	globalError: null,
};

function RowBlock({
	row,
	state,
	accounts,
	categories,
	invoices,
	bulkCategory,
	error,
	onChange,
}: {
	row: ConfirmFormRow;
	state: RowState | undefined;
	accounts: ConfirmFormAccount[];
	categories: ConfirmFormCategory[];
	invoices: ConfirmFormInvoice[];
	bulkCategory: ConfirmFormCategory | null;
	error: string | null;
	onChange: (patch: Partial<RowState>) => void;
}) {
	if (!state) return null;
	const movementType = state.movementType;
	const isTransferLike = isTransferLikeMovement(movementType);
	const isCardImport = row.cardId !== null && row.cardInvoiceId !== null;
	const filteredCategories = isTransferLike
		? []
		: categories.filter((category) => category.kind === movementType);
	const categoryErrorId = error ? `row-${row.id}-category-error` : undefined;
	const isIgnoreSuggestion = row.suggestionSource === "rule_ignore";
	const suggestionVisible =
		!isTransferLike &&
		row.suggestedCategoryId &&
		row.suggestedCategoryName &&
		categories.find((category) => category.id === row.suggestedCategoryId)
			?.kind === movementType;
	const sourceAccount = accounts.find(
		(account) => String(account.id) === state.sourceAccountId,
	);
	const destinationAccount = accounts.find(
		(account) => String(account.id) === state.destinationAccountId,
	);
	const transferSuggestionVisible =
		movementType === "transfer" &&
		row.suggestedSourceAccountId &&
		row.suggestedDestinationAccountId;
	const destinationOptions = accounts;
	const sourceOptions =
		movementType === "credit_card_payment"
			? accounts.filter((account) => account.type !== "credit_card")
			: accounts;
	const bulkWillApply =
		bulkCategory && !state.categoryId && bulkCategory.kind === movementType;
	const bulkWillSkip =
		bulkCategory && !state.categoryId && bulkCategory.kind !== movementType;

	return (
		<div className="grid gap-3 rounded-md border border p-4">
			<div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
				<RowFact label="Linha" value={row.rowNumber} />
				<RowFact label="Data" value={row.occurredOn ?? "sem data"} />
				<RowFact
					label="Valor"
					value={
						<Money
							cents={row.amountCents ?? 0}
							sign={
								movementType === "transfer"
									? "neutral"
									: movementType === "income"
										? "credit"
										: "debit"
							}
						/>
					}
				/>
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
			<div className="rounded-md bg-muted/50 p-3 text-sm">
				<p className="text-muted-foreground text-xs">Descrição importada</p>
				<p className="text-foreground">
					{row.originalDescription || "sem descrição"}
				</p>
			</div>
			<ParsedDataPreview parsedData={row.parsedData} />
			{row.bankCategory && (
				<p className="text-muted-foreground text-sm">
					Categoria do banco: {row.bankCategory}
				</p>
			)}
			{row.hadSensitiveData && (
				<p className="text-sm text-warning">
					Dados sensíveis (CPF, cartão, etc.) detectados e mascarados antes de
					salvar.
				</p>
			)}
			{isIgnoreSuggestion ? (
				<p className="text-sm text-warning">
					Sugestão: ignorar esta linha
					{row.suggestedRuleDescription
						? ` — a partir da regra “${row.suggestedRuleDescription}”`
						: ""}
				</p>
			) : transferSuggestionVisible ? (
				<p className="text-primary text-sm">
					Sugestão de transferência: <strong>{sourceAccount?.name}</strong> →{" "}
					<strong>{destinationAccount?.name}</strong>
					{row.suggestedRuleDescription
						? ` — a partir da regra “${row.suggestedRuleDescription}”`
						: ""}
				</p>
			) : suggestionVisible ? (
				<p className="text-primary text-sm">
					Sugestão de categoria: <strong>{row.suggestedCategoryName}</strong>
					{row.suggestedRuleDescription
						? ` — a partir da regra “${row.suggestedRuleDescription}”`
						: ""}
				</p>
			) : null}
			{!isIgnoreSuggestion &&
				row.suggestedRecurrenceId &&
				row.suggestedRecurrenceOccurrenceOn && (
					<p className="text-info text-sm">
						Parece ser a recorrência{" "}
						<strong>
							{row.suggestedRecurrenceName ?? `#${row.suggestedRecurrenceId}`}
						</strong>{" "}
						(vencimento {row.suggestedRecurrenceOccurrenceOn}).
					</p>
				)}
			{row.validationError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
					<p className="font-medium text-destructive">
						Problema na linha: {row.validationError}
					</p>
					<p className="mt-1 text-destructive">
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
						<option value="transfer">Transferência</option>
						<option value="credit_card_payment">Pagamento de fatura</option>
					</select>
				</FieldLabel>
				{isCardImport && !isTransferLike ? (
					<div className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm">
						<input
							name={`row-${row.id}-cardId`}
							type="hidden"
							value={row.cardId ?? ""}
						/>
						<input
							name={`row-${row.id}-cardInvoiceId`}
							type="hidden"
							value={row.cardInvoiceId ?? ""}
						/>
						Linha importada para a fatura escolhida do cartão.
					</div>
				) : (
					<FieldLabel
						hint={
							movementType === "credit_card_payment"
								? "Conta normal de onde sai o dinheiro da fatura."
								: undefined
						}
						label={isTransferLike ? "Origem" : "Conta"}
					>
						<select
							className={inputClass}
							name={`row-${row.id}-accountId`}
							onChange={(event) =>
								onChange({ sourceAccountId: event.target.value })
							}
							value={state.sourceAccountId}
						>
							{sourceOptions.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
					</FieldLabel>
				)}
				{movementType === "credit_card_payment" ? (
					<FieldLabel
						hint="Escolha a fatura específica paga por esta linha."
						label="Fatura paga"
					>
						<select
							className={inputClass}
							name={`row-${row.id}-cardInvoiceId`}
							onChange={(event) =>
								onChange({ cardInvoiceId: event.target.value })
							}
							required
							value={state.cardInvoiceId}
						>
							<option value="">Selecione a fatura</option>
							{invoices.map((invoice) => (
								<option key={invoice.id} value={invoice.id}>
									{invoice.cardName} · {invoice.monthKey}
								</option>
							))}
						</select>
					</FieldLabel>
				) : movementType === "transfer" ? (
					<FieldLabel label="Destino">
						<select
							className={inputClass}
							name={`row-${row.id}-destinationAccountId`}
							onChange={(event) =>
								onChange({ destinationAccountId: event.target.value })
							}
							required
							value={state.destinationAccountId}
						>
							<option value="">Selecione o destino</option>
							{destinationOptions.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
					</FieldLabel>
				) : null}
				{isTransferLike ? null : (
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
				)}
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
						name={`row-${row.id}-description`}
						onChange={(event) => onChange({ description: event.target.value })}
						value={state.description}
					/>
				</FieldLabel>
			</div>
			{error && (
				<p
					className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
					id={categoryErrorId}
					role="alert"
				>
					{error}
				</p>
			)}
			{!isIgnoreSuggestion &&
				row.suggestedRecurrenceId &&
				suggestionVisible && (
					<label className="flex items-center gap-2 text-info text-sm">
						<input
							defaultChecked
							name={`row-${row.id}-acceptRecurrence`}
							type="checkbox"
						/>{" "}
						Confirmar como ocorrência desta recorrência
					</label>
				)}
			{movementType === "credit_card_payment" ? (
				<p className="text-muted-foreground text-xs">
					Pagamentos de fatura ainda não geram regra automática — selecione o
					cartão pago em cada importação.
				</p>
			) : (
				<label className="flex items-center gap-2 text-muted-foreground text-sm">
					<input name={`row-${row.id}-createRule`} type="checkbox" /> Salvar a
					decisão desta linha como nova regra (categorizar, transferir ou
					ignorar). Aplica em lotes futuros.
				</label>
			)}
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
			className={`grid gap-1 text-muted-foreground text-sm ${wrapperClassName ?? ""}`}
		>
			<span>{label}</span>
			{children}
			{hint ? (
				<span className="text-muted-foreground text-xs">{hint}</span>
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
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className={className ?? "text-foreground"}>{value}</p>
		</div>
	);
}

function ParsedDataPreview({ parsedData }: { parsedData: unknown }) {
	const entries = parsedDataEntries(parsedData).filter(
		([key]) => key !== "hadSensitiveData",
	);
	if (entries.length === 0) return null;

	return (
		<details className="rounded-md border border p-3 text-sm">
			<summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
				Valores lidos direto do CSV
			</summary>
			<dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
				{entries.map(([key, value]) => (
					<div key={key}>
						<dt className="text-muted-foreground text-xs">
							{parsedDataLabel(key)}
						</dt>
						<dd className="break-words text-foreground">{value || "—"}</dd>
					</div>
				))}
			</dl>
			<p className="mt-2 text-muted-foreground text-xs">
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
	if (status === "duplicate") return "text-warning";
	if (status === "invalid") return "text-destructive";
	if (status === "imported") return "text-primary";
	return "text-muted-foreground";
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
