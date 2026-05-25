"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

type DialogAction = (formData: FormData) => Promise<unknown> | unknown;

type WrapActionOptions = {
	success: string;
	error?: string;
	onSuccess?: () => void;
	onError?: (error: unknown) => void;
	closeOnSuccess?: boolean;
	closeOnError?: boolean;
};

function isRedirectError(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"digest" in error &&
		typeof error.digest === "string" &&
		error.digest.startsWith("NEXT_REDIRECT")
	);
}

export function getActionErrorMessage(
	error: unknown,
	fallback = "Não foi possível concluir a ação.",
) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return fallback;
}

export function useDialogAction() {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const onOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!submitting) setOpen(nextOpen);
		},
		[submitting],
	);

	const wrapAction = useCallback(
		(action: DialogAction, options: WrapActionOptions) =>
			async (formData: FormData) => {
				let succeeded = false;
				setSubmitting(true);

				try {
					await action(formData);
					succeeded = true;
					toast.success(options.success);
					options.onSuccess?.();
				} catch (error) {
					if (isRedirectError(error)) throw error;
					toast.error(options.error ?? getActionErrorMessage(error));
					options.onError?.(error);
				} finally {
					setSubmitting(false);
					if (
						(succeeded && options.closeOnSuccess !== false) ||
						(!succeeded && options.closeOnError !== false)
					) {
						setOpen(false);
					}
				}
			},
		[],
	);

	return { open, onOpenChange, setOpen, submitting, wrapAction };
}
