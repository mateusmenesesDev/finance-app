"use client";

import type { ReactNode } from "react";

import { SubmitButton } from "~/components/submit-button";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { useDialogAction } from "~/hooks/use-dialog-action";

type BudgetDeleteDialogProps = {
	action: (formData: FormData) => void | Promise<void>;
	budgetId: number;
	isRecurring: boolean;
	trigger?: ReactNode;
};

export function BudgetDeleteDialog({
	action,
	budgetId,
	isRecurring,
	trigger = (
		<Button size="sm" variant="destructive">
			Excluir
		</Button>
	),
}: BudgetDeleteDialogProps) {
	const { open, onOpenChange, setOpen, wrapAction } = useDialogAction();

	if (!isRecurring) {
		return (
			<ConfirmDialog
				action={action}
				confirmLabel="Excluir"
				destructive
				errorMessage="Não foi possível excluir o orçamento."
				hidden={{ id: budgetId }}
				successMessage="Orçamento excluído."
				title="Excluir orçamento?"
				trigger={trigger}
			/>
		);
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Excluir orçamento recorrente?</DialogTitle>
					<DialogDescription>
						Você pode apagar só este mês ou encerrar o orçamento recorrente daqui
						para frente.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<form
						action={wrapAction(action, {
							success: "Orçamento removido só deste mês.",
						})}
						className="grid gap-2 rounded-md border p-3"
					>
						<input name="id" type="hidden" value={budgetId} />
						<input name="deleteMode" type="hidden" value="month_only" />
						<p className="text-sm">
							Mantém o recorrente ativo para os próximos meses.
						</p>
						<SubmitButton pendingLabel="Excluindo..." variant="outline">
							Excluir só este mês
						</SubmitButton>
					</form>
					<form
						action={wrapAction(action, {
							success: "Orçamento recorrente encerrado.",
						})}
						className="grid gap-2 rounded-md border border-destructive/40 p-3"
					>
						<input name="id" type="hidden" value={budgetId} />
						<input name="deleteMode" type="hidden" value="template" />
						<p className="text-sm">
							Remove este orçamento do mês atual e dos próximos meses.
						</p>
						<SubmitButton pendingLabel="Encerrando..." variant="destructive">
							Excluir recorrente
						</SubmitButton>
					</form>
				</div>
				<DialogFooter>
					<Button onClick={() => setOpen(false)} type="button" variant="outline">
						Cancelar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
