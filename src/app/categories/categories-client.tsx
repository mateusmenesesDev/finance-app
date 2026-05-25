"use client";

import { Archive, FolderPlus, Pencil, Plus, Tags } from "lucide-react";
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
import { ActionDialog } from "~/components/action-dialog";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { EmptyState } from "~/components/empty-state";
import { Money } from "~/components/money";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CategoryActionState } from "~/lib/category-errors";

const initialState: CategoryActionState = { error: null };

const kindLabels = { income: "Receita", expense: "Despesa" };
const cashFlowRoleLabels = {
	operational: "Principal",
	financial: "Financeira",
};

type CategoryGroup = {
	id: number;
	name: string;
	kind: "income" | "expense";
	cashFlowRole: "operational" | "financial";
};

type Category = {
	id: number;
	groupId: number;
	name: string;
	kind: "income" | "expense";
};

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
	const [visibleError, setVisibleError] = useState<string | null>(null);
	const [visibleGroups, setVisibleGroups] = useState(activeGroups);
	const [visibleCategories, setVisibleCategories] = useState(activeCategories);

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
		setVisibleGroups((current) => current.filter((group) => group.id !== id));
		setVisibleCategories((current) =>
			current.filter((category) => category.groupId !== id),
		);
		try {
			await archiveCategoryGroup(formData);
		} catch {
			setVisibleGroups(groupsBefore);
			setVisibleCategories(categoriesBefore);
			throw new Error("Não foi possível arquivar o grupo.");
		}
	}

	async function archiveCategoryWithRollback(formData: FormData) {
		const id = Number(formData.get("id"));
		const before = visibleCategories;
		setVisibleCategories((current) =>
			current.filter((category) => category.id !== id),
		);
		try {
			await archiveCategory(formData);
		} catch {
			setVisibleCategories(before);
			throw new Error("Não foi possível arquivar a categoria.");
		}
	}

	useEffect(() => {
		if (defaultState.error) setVisibleError(defaultState.error);
	}, [defaultState]);

	async function createGroupAction(formData: FormData) {
		setVisibleError(null);
		const result = await createCategoryGroup(initialState, formData);
		if (result.error) throw new Error(result.error);
	}

	async function updateGroupAction(formData: FormData) {
		setVisibleError(null);
		const result = await updateCategoryGroup(initialState, formData);
		if (result.error) throw new Error(result.error);
	}

	async function createCategoryAction(formData: FormData) {
		setVisibleError(null);
		const result = await createCategory(initialState, formData);
		if (result.error) throw new Error(result.error);
	}

	async function updateCategoryAction(formData: FormData) {
		setVisibleError(null);
		const result = await updateCategory(initialState, formData);
		if (result.error) throw new Error(result.error);
	}

	return (
		<>
			{visibleError ? (
				<div
					aria-live="polite"
					className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm"
					role="alert"
				>
					{visibleError}
				</div>
			) : null}

			<Card>
				<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle>Criar categorias</CardTitle>
						<CardDescription>
							Crie grupos e categorias mantendo o histórico arquivado.
						</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						<form action={defaultAction} onSubmit={() => setVisibleError(null)}>
							<SubmitButton pendingLabel="Criando..." variant="outline">
								Criar categorias iniciais
							</SubmitButton>
						</form>
						<CreateGroupDialog action={createGroupAction} />
						<CreateCategoryDialog
							action={createCategoryAction}
							groups={visibleGroups}
						/>
					</div>
				</CardHeader>
			</Card>

			<section className="grid gap-6 lg:grid-cols-2">
				<GroupsCard
					action={updateGroupAction}
					archiveAction={archiveGroupWithRollback}
					groups={visibleGroups}
					groupTotals={groupTotals}
				/>
				<CategoriesCard
					action={updateCategoryAction}
					archiveAction={archiveCategoryWithRollback}
					categories={visibleCategories}
					categoryTotals={categoryTotals}
					groups={visibleGroups}
				/>
			</section>
		</>
	);
}

function CreateGroupDialog({
	action,
}: {
	action: (payload: FormData) => Promise<void>;
}) {
	return (
		<ActionDialog
			action={action}
			description="Cadastre um grupo de receita ou despesa."
			formClassName="grid gap-4"
			pendingLabel="Cadastrando..."
			submitLabel="Cadastrar grupo"
			successMessage="Grupo criado."
			title="Novo grupo"
			trigger={
				<Button>
					<FolderPlus className="size-4" />
					Novo grupo
				</Button>
			}
		>
			<Field label="Grupo" name="name" />
			<KindSelect />
			<CashFlowRoleSelect />
		</ActionDialog>
	);
}

function CreateCategoryDialog({
	action,
	groups,
}: {
	action: (payload: FormData) => Promise<void>;
	groups: CategoryGroup[];
}) {
	return (
		<ActionDialog
			action={action}
			description="Vincule a categoria a um grupo existente."
			formClassName="grid gap-4"
			pendingLabel="Cadastrando..."
			submitLabel="Cadastrar categoria"
			successMessage="Categoria criada."
			title="Nova categoria"
			trigger={
				<Button variant="secondary">
					<Plus className="size-4" />
					Nova categoria
				</Button>
			}
		>
			<Field label="Categoria" name="name" />
			<GroupSelect groups={groups} name="groupId" />
		</ActionDialog>
	);
}

function GroupsCard({
	groups,
	groupTotals,
	action,
	archiveAction,
}: {
	groups: CategoryGroup[];
	groupTotals: Record<number, number>;
	action: (payload: FormData) => Promise<void>;
	archiveAction: (formData: FormData) => Promise<void>;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Grupos</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				{groups.length === 0 ? (
					<EmptyState icon={Tags} title="Nenhum grupo cadastrado." />
				) : null}
				{groups.map((group) => (
					<div className="rounded-md border bg-muted/10 p-4" key={group.id}>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-medium">{group.name}</p>
									<Badge
										variant={group.kind === "income" ? "default" : "secondary"}
									>
										{kindLabels[group.kind]}
									</Badge>
									{group.kind === "income" ? (
										<Badge variant="outline">
											{cashFlowRoleLabels[group.cashFlowRole]}
										</Badge>
									) : null}
								</div>
								<Money
									cents={groupTotals[group.id] ?? 0}
									className="mt-1 block text-sm"
									tone="muted"
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								<EditGroupDialog action={action} group={group} />
								<ConfirmDialog
									action={archiveAction}
									confirmLabel="Arquivar"
									destructive
									errorMessage="Não foi possível arquivar o grupo."
									hidden={{ id: group.id }}
									successMessage="Grupo arquivado."
									title="Arquivar grupo?"
									trigger={
										<Button size="sm" variant="destructive">
											<Archive className="size-4" />
											Arquivar
										</Button>
									}
								/>
							</div>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function CategoriesCard({
	categories,
	groups,
	categoryTotals,
	action,
	archiveAction,
}: {
	categories: Category[];
	groups: CategoryGroup[];
	categoryTotals: Record<number, number>;
	action: (payload: FormData) => Promise<void>;
	archiveAction: (formData: FormData) => Promise<void>;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Categorias</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				{categories.length === 0 ? (
					<EmptyState icon={Tags} title="Nenhuma categoria cadastrada." />
				) : null}
				{categories.map((category) => (
					<div className="rounded-md border bg-muted/10 p-4" key={category.id}>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-medium">{category.name}</p>
									<Badge
										variant={
											category.kind === "income" ? "default" : "secondary"
										}
									>
										{kindLabels[category.kind]}
									</Badge>
								</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{categoryTotals[category.id] !== undefined ? (
										<Money
											cents={categoryTotals[category.id] ?? 0}
											tone="muted"
										/>
									) : (
										"sem gasto"
									)}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<EditCategoryDialog
									action={action}
									category={category}
									groups={groups.filter(
										(group) => group.kind === category.kind,
									)}
								/>
								<ConfirmDialog
									action={archiveAction}
									confirmLabel="Arquivar"
									destructive
									errorMessage="Não foi possível arquivar a categoria."
									hidden={{ id: category.id }}
									successMessage="Categoria arquivada."
									title="Arquivar categoria?"
									trigger={
										<Button size="sm" variant="destructive">
											<Archive className="size-4" />
											Arquivar
										</Button>
									}
								/>
							</div>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function EditGroupDialog({
	group,
	action,
}: {
	group: CategoryGroup;
	action: (payload: FormData) => Promise<void>;
}) {
	return (
		<ActionDialog
			action={action}
			formClassName="grid gap-4"
			pendingLabel="Salvando..."
			submitLabel="Salvar"
			successMessage="Grupo atualizado."
			title="Editar grupo"
			trigger={
				<Button size="sm" variant="outline">
					<Pencil className="size-4" />
					Editar
				</Button>
			}
		>
			<input name="id" type="hidden" value={group.id} />
			<Field defaultValue={group.name} label="Grupo" name="name" />
			<CashFlowRoleSelect defaultValue={group.cashFlowRole} />
		</ActionDialog>
	);
}

function EditCategoryDialog({
	category,
	groups,
	action,
}: {
	category: Category;
	groups: CategoryGroup[];
	action: (payload: FormData) => Promise<void>;
}) {
	return (
		<ActionDialog
			action={action}
			formClassName="grid gap-4"
			pendingLabel="Salvando..."
			submitLabel="Salvar"
			successMessage="Categoria atualizada."
			title="Editar categoria"
			trigger={
				<Button size="sm" variant="outline">
					<Pencil className="size-4" />
					Editar
				</Button>
			}
		>
			<input name="id" type="hidden" value={category.id} />
			<Field defaultValue={category.name} label="Categoria" name="name" />
			<GroupSelect
				defaultValue={category.groupId}
				groups={groups}
				name="groupId"
			/>
		</ActionDialog>
	);
}

function Field({
	label,
	name,
	...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`category-${name}`}>{label}</Label>
			<Input id={`category-${name}`} name={name} {...props} />
		</div>
	);
}

function KindSelect() {
	return (
		<div className="grid gap-2">
			<Label htmlFor="category-kind">Tipo</Label>
			<select className={selectClass} id="category-kind" name="kind">
				<option value="income">Receita</option>
				<option value="expense">Despesa</option>
			</select>
		</div>
	);
}

function CashFlowRoleSelect({
	defaultValue = "operational",
}: {
	defaultValue?: "operational" | "financial";
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor="category-cash-flow-role">Papel no fluxo</Label>
			<select
				className={selectClass}
				defaultValue={defaultValue}
				id="category-cash-flow-role"
				name="cashFlowRole"
			>
				<option value="operational">Receita/despesa principal</option>
				<option value="financial">Receita financeira</option>
			</select>
			<p className="text-muted-foreground text-xs">
				Use “Receita financeira” para rendimentos de caixinhas/investimentos.
			</p>
		</div>
	);
}

function GroupSelect({
	groups,
	name,
	defaultValue,
}: {
	groups: CategoryGroup[];
	name: string;
	defaultValue?: number;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`category-${name}`}>Grupo</Label>
			<select
				className={selectClass}
				defaultValue={defaultValue}
				id={`category-${name}`}
				name={name}
			>
				{groups.map((group) => (
					<option key={group.id} value={group.id}>
						{group.name} ({group.kind === "income" ? "receita" : "despesa"})
					</option>
				))}
			</select>
		</div>
	);
}

const selectClass =
	"h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
