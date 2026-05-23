"use client";

import { useState } from "react";

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

type Props = {
	trigger: React.ReactNode;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
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
	cancelLabel = "Cancelar",
	destructive = false,
	action,
	hidden,
}: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<form action={action}>
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
						<Button
							onClick={() => setOpen(false)}
							type="submit"
							variant={destructive ? "destructive" : "default"}
						>
							{confirmLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
