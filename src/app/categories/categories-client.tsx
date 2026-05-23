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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CategoryActionState } from "~/lib/category-errors";

const initialState: CategoryActionState = { error: null };

const kindLabels = { income: "Receita", expense: "Despesa" };

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
						<CreateGroupDialog
							action={createGroupAction}
							onSubmit={() => setVisibleError(null)}
						/>
						<CreateCategoryDialog
							action={createAction}
							groups={visibleGroups}
							onSubmit={() => setVisibleError(null)}
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
					onSubmit={() => setVisibleError(null)}
				/>
				<CategoriesCard
					action={updateAction}
					archiveAction={archiveCategoryWithRollback}
					categories={visibleCategories}
					categoryTotals={categoryTotals}
					groups={visibleGroups}
					onSubmit={() => setVisibleError(null)}
				/>
			</section>
		</>
	);
}

function CreateGroupDialog({
	action,
	onSubmit,
}: {
	action: (payload: FormData) => void;
	onSubmit: () => void;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button>
					<FolderPlus className="size-4" />
					Novo grupo
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Novo grupo</DialogTitle>
					<DialogDescription>
						Cadastre um grupo de receita ou despesa.
					</DialogDescription>
				</DialogHeader>
				<form action={action} className="grid gap-4" onSubmit={onSubmit}>
					<Field label="Grupo" name="name" />
					<KindSelect />
					<DialogFooter>
						<SubmitButton pendingLabel="Cadastrando...">
							Cadastrar grupo
						</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function CreateCategoryDialog({
	action,
	groups,
	onSubmit,
}: {
	action: (payload: FormData) => void;
	groups: CategoryGroup[];
	onSubmit: () => void;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="secondary">
					<Plus className="size-4" />
					Nova categoria
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Nova categoria</DialogTitle>
					<DialogDescription>
						Vincule a categoria a um grupo existente.
					</DialogDescription>
				</DialogHeader>
				<form action={action} className="grid gap-4" onSubmit={onSubmit}>
					<Field label="Categoria" name="name" />
					<GroupSelect groups={groups} name="groupId" />
					<DialogFooter>
						<SubmitButton pendingLabel="Cadastrando...">
							Cadastrar categoria
						</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function GroupsCard({
	groups,
	groupTotals,
	action,
	archiveAction,
	onSubmit,
}: {
	groups: CategoryGroup[];
	groupTotals: Record<number, number>;
	action: (payload: FormData) => void;
	archiveAction: (formData: FormData) => Promise<void>;
	onSubmit: () => void;
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
								</div>
								<Money
									cents={groupTotals[group.id] ?? 0}
									className="mt-1 block text-sm"
									tone="muted"
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								<EditGroupDialog
									action={action}
									group={group}
									onSubmit={onSubmit}
								/>
								<ConfirmDialog
									action={archiveAction}
									confirmLabel="Arquivar"
									destructive
									hidden={{ id: group.id }}
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
	onSubmit,
}: {
	categories: Category[];
	groups: CategoryGroup[];
	categoryTotals: Record<number, number>;
	action: (payload: FormData) => void;
	archiveAction: (formData: FormData) => Promise<void>;
	onSubmit: () => void;
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
									onSubmit={onSubmit}
								/>
								<ConfirmDialog
									action={archiveAction}
									confirmLabel="Arquivar"
									destructive
									hidden={{ id: category.id }}
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
	onSubmit,
}: {
	group: CategoryGroup;
	action: (payload: FormData) => void;
	onSubmit: () => void;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Pencil className="size-4" />
					Editar
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar grupo</DialogTitle>
				</DialogHeader>
				<form action={action} className="grid gap-4" onSubmit={onSubmit}>
					<input name="id" type="hidden" value={group.id} />
					<Field defaultValue={group.name} label="Grupo" name="name" />
					<DialogFooter>
						<SubmitButton>Salvar</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditCategoryDialog({
	category,
	groups,
	action,
	onSubmit,
}: {
	category: Category;
	groups: CategoryGroup[];
	action: (payload: FormData) => void;
	onSubmit: () => void;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Pencil className="size-4" />
					Editar
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar categoria</DialogTitle>
				</DialogHeader>
				<form action={action} className="grid gap-4" onSubmit={onSubmit}>
					<input name="id" type="hidden" value={category.id} />
					<Field defaultValue={category.name} label="Categoria" name="name" />
					<GroupSelect
						defaultValue={category.groupId}
						groups={groups}
						name="groupId"
					/>
					<DialogFooter>
						<SubmitButton>Salvar</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
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
