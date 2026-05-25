"use client";

import { SubmitButton } from "~/components/submit-button";
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

type Props = {
	trigger: React.ReactNode;
	title: string;
	description?: string;
	confirmLabel?: string;
	pendingLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	successMessage?: string;
	errorMessage?: string;
	/** Server action or any submit handler attached to the inner form. */
	action: (formData: FormData) => void | Promise<void>;
	/** Extra hidden inputs passed to the action. */
	hidden?: Record<string, string | number>;
};

/**
 * Confirms a destructive or important action via a server-action form.
 * Usage: <ConfirmDialog trigger={<Button>Excluir</Button>} title="..." action={serverAction} hidden={{ id }}/>
 */
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel = "Confirmar",
	pendingLabel,
	cancelLabel = "Cancelar",
	destructive = false,
	successMessage = "Ação concluída com sucesso.",
	errorMessage,
	action,
	hidden,
}: Props) {
	const { open, onOpenChange, setOpen, wrapAction } = useDialogAction();

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<form
					action={wrapAction(action, {
						success: successMessage,
						error: errorMessage,
					})}
				>
					{hidden
						? Object.entries(hidden).map(([key, value]) => (
								<input key={key} name={key} type="hidden" value={value} />
							))
						: null}
					<DialogFooter className="mt-4">
						<Button
							onClick={() => setOpen(false)}
							type="button"
							variant="outline"
						>
							{cancelLabel}
						</Button>
						<SubmitButton
							pendingLabel={pendingLabel ?? `${confirmLabel}...`}
							variant={destructive ? "destructive" : "default"}
						>
							{confirmLabel}
						</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
