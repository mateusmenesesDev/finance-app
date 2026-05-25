"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { SubmitButton } from "~/components/submit-button";
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

type ActionDialogProps = {
	trigger: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action: (formData: FormData) => Promise<unknown> | unknown;
	successMessage: string;
	errorMessage?: string;
	submitLabel: ReactNode;
	pendingLabel?: string;
	submitVariant?: ComponentProps<typeof SubmitButton>["variant"];
	contentClassName?: string;
	formClassName?: string;
	footerClassName?: string;
	redirectTo?: string;
	submitButtonProps?: Omit<
		ComponentProps<typeof SubmitButton>,
		"children" | "pendingLabel" | "variant"
	>;
	children: ReactNode;
};

export function ActionDialog({
	trigger,
	title,
	description,
	action,
	successMessage,
	errorMessage,
	submitLabel,
	pendingLabel,
	submitVariant = "default",
	contentClassName,
	formClassName,
	footerClassName,
	redirectTo,
	submitButtonProps,
	children,
}: ActionDialogProps) {
	const router = useRouter();
	const { open, onOpenChange, wrapAction } = useDialogAction();

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className={contentClassName}>
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
						onSuccess: redirectTo ? () => router.push(redirectTo) : undefined,
					})}
					className={formClassName}
				>
					{children}
					<DialogFooter className={footerClassName}>
						<SubmitButton
							{...submitButtonProps}
							pendingLabel={pendingLabel}
							variant={submitVariant}
						>
							{submitLabel}
						</SubmitButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
