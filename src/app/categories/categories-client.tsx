"use client";

import { useActionState, useEffect, useState } from "react";

import {
	archiveCategory,
	archiveCategoryGroup,
	createCategory,
	createCategoryGroup,
	createDefaultCategories,
	updateCategory,
	updateCategoryGroup,
} from "~/app/_actions/finance-actions";
import {
	DangerSubmitButton,
	SubmitButton,
} from "~/app/_components/pending-submit-button";
import type { CategoryActionState } from "~/lib/category-errors";
import { formatMoney } from "~/lib/formatters";

type CategoryGroup = {
	id: number;
	name: string;
	kind: "income" | "expense";
};

type Category = {
	id: number;
	groupId: number;
	name: string;
	kind: "income" | "expense";
};

const initialState: CategoryActionState = { error: null };

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

function Panel({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-xl">{title}</h2>
			</div>
			{children}
		</section>
	);
}

export function CategoriesClient({
	activeGroups,
	activeCategories,
	categoryTotals,
	groupTotals,
}: {
	activeGroups: CategoryGroup[];
	activeCategories: Category[];
	categoryTotals: Record<number, number>;
	groupTotals: Record<number, number>;
}) {
	const [defaultState, defaultAction] = useActionState(
		createDefaultCategories,
		initialState,
	);
	const [createGroupState, createGroupAction] = useActionState(
		createCategoryGroup,
		initialState,
	);
	const [updateGroupState, updateGroupAction] = useActionState(
		updateCategoryGroup,
		initialState,
	);
	const [createState, createAction] = useActionState(
		createCategory,
		initialState,
	);
	const [updateState, updateAction] = useActionState(
		updateCategory,
		initialState,
	);
	const [visibleError, setVisibleError] = useState<string | null>(null);
	const [visibleGroups, setVisibleGroups] = useState(activeGroups);
	const [visibleCategories, setVisibleCategories] = useState(activeCategories);
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		setVisibleGroups(activeGroups);
	}, [activeGroups]);
	useEffect(() => {
		setVisibleCategories(activeCategories);
	}, [activeCategories]);

	async function archiveGroupWithRollback(formData: FormData) {
		const id = Number(formData.get("id"));
		const groupsBefore = visibleGroups;
		const categoriesBefore = visibleCategories;
		setVisibleError(null);
		setStatus("Arquivando grupo...");
		setVisibleGroups((current) => current.filter((group) => group.id !== id));
		setVisibleCategories((current) =>
			current.filter((category) => category.groupId !== id),
		);
		try {
			await archiveCategoryGroup(formData);
			setStatus("Grupo arquivado.");
		} catch {
			setVisibleGroups(groupsBefore);
			setVisibleCategories(categoriesBefore);
			setVisibleError("Não foi possível arquivar o grupo.");
			setStatus(null);
		}
	}

	async function archiveCategoryWithRollback(formData: FormData) {
		const id = Number(formData.get("id"));
		const before = visibleCategories;
		setVisibleError(null);
		setStatus("Arquivando categoria...");
		setVisibleCategories((current) =>
			current.filter((category) => category.id !== id),
		);
		try {
			await archiveCategory(formData);
			setStatus("Categoria arquivada.");
		} catch {
			setVisibleCategories(before);
			setVisibleError("Não foi possível arquivar a categoria.");
			setStatus(null);
		}
	}

	useEffect(() => {
		if (defaultState.error) setVisibleError(defaultState.error);
	}, [defaultState]);
	useEffect(() => {
		if (createGroupState.error) setVisibleError(createGroupState.error);
	}, [createGroupState]);
	useEffect(() => {
		if (updateGroupState.error) setVisibleError(updateGroupState.error);
	}, [updateGroupState]);
	useEffect(() => {
		if (createState.error) setVisibleError(createState.error);
	}, [createState]);
	useEffect(() => {
		if (updateState.error) setVisibleError(updateState.error);
	}, [updateState]);

	return (
		<>
			<p aria-live="polite" className="sr-only" role="status">
				{status ?? ""}
			</p>
			{visibleError ? (
				<div
					aria-live="polite"
					className="rounded-2xl border border-[color:var(--color-bad-border)] bg-[color:var(--color-surface)] p-4 text-[color:var(--color-bad)] text-sm"
					role="alert"
				>
					{visibleError}
				</div>
			) : null}

			<Panel title="Criar categorias">
				<form
					action={defaultAction}
					className="mb-4"
					onSubmit={() => setVisibleError(null)}
				>
					<SubmitButton pendingLabel="Criando...">
						Criar categorias iniciais
					</SubmitButton>
				</form>
				<form
					action={createGroupAction}
					className="grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-3"
					onSubmit={() => setVisibleError(null)}
				>
					<TextInput name="name" placeholder="Grupo" />
					<Select
						name="kind"
						options={{ income: "Receita", expense: "Despesa" }}
					/>
					<SubmitButton pendingLabel="Cadastrando...">
						Cadastrar grupo
					</SubmitButton>
				</form>
				<form
					action={createAction}
					className="mt-3 grid gap-3 rounded-2xl border border-[color:var(--color-border-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-3"
					onSubmit={() => setVisibleError(null)}
				>
					<TextInput name="name" placeholder="Categoria" />
					<select className={inputClass} name="groupId">
						{visibleGroups.map((group) => (
							<option key={group.id} value={group.id}>
								{group.name} ({group.kind === "income" ? "receita" : "despesa"})
							</option>
						))}
					</select>
					<SubmitButton pendingLabel="Cadastrando...">
						Cadastrar categoria
					</SubmitButton>
				</form>
			</Panel>

			<section className="grid gap-6 lg:grid-cols-2">
				<Panel title="Grupos">
					<div className="grid gap-2">
						{visibleGroups.map((group) => (
							<form
								action={updateGroupAction}
								className="grid gap-2 rounded-xl border border-[color:var(--color-border-subtle)] p-3 sm:grid-cols-[1fr_110px_120px_90px]"
								key={group.id}
								onSubmit={() => setVisibleError(null)}
							>
								<input name="id" type="hidden" value={group.id} />
								<TextInput defaultValue={group.name} name="name" />
								<p className="text-[color:var(--color-text-muted)] text-sm">
									{group.kind === "income" ? "Receita" : "Despesa"}
									<br />
									{formatMoney(groupTotals[group.id] ?? 0)}
								</p>
								<SubmitButton>Salvar</SubmitButton>
								<DangerSubmitButton formAction={archiveGroupWithRollback}>
									Arquivar
								</DangerSubmitButton>
							</form>
						))}
					</div>
				</Panel>

				<Panel title="Categorias">
					<div className="grid gap-2">
						{visibleCategories.map((category) => (
							<form
								action={updateAction}
								className="grid gap-2 rounded-xl border border-[color:var(--color-border-subtle)] p-3 sm:grid-cols-[1fr_1fr_120px_90px]"
								key={category.id}
								onSubmit={() => setVisibleError(null)}
							>
								<input name="id" type="hidden" value={category.id} />
								<TextInput defaultValue={category.name} name="name" />
								<select
									className={inputClass}
									defaultValue={category.groupId}
									name="groupId"
								>
									{visibleGroups
										.filter((group) => group.kind === category.kind)
										.map((group) => (
											<option key={group.id} value={group.id}>
												{group.name}
											</option>
										))}
								</select>
								<p className="text-[color:var(--color-text-muted)] text-sm">
									{category.kind === "income" ? "Receita" : "Despesa"}
									<br />
									{categoryTotals[category.id] !== undefined
										? formatMoney(categoryTotals[category.id] ?? 0)
										: "sem gasto"}
								</p>
								<SubmitButton>Salvar</SubmitButton>
								<DangerSubmitButton
									className="md:col-start-4"
									formAction={archiveCategoryWithRollback}
								>
									Arquivar
								</DangerSubmitButton>
							</form>
						))}
					</div>
				</Panel>
			</section>
		</>
	);
}
