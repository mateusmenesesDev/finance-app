"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export type ActionResult =
	| { status?: "success"; message?: string }
	| { status?: "error"; message?: string }
	| { error?: string; success?: string }
	| undefined
	| null;

/**
 * Surfaces server-action results as toasts.
 * Pass the result returned by `useActionState`; the hook fires once per change.
 *
 * Conventions:
 *   - { status: "success", message } → toast.success
 *   - { status: "error",   message } → toast.error
 *   - { error: string }              → toast.error
 *   - { success: string }            → toast.success
 */
export function useActionToast(result: ActionResult) {
	const lastSeen = useRef<unknown>(null);

	useEffect(() => {
		if (!result || result === lastSeen.current) return;
		lastSeen.current = result;

		if ("status" in result && result.status === "success") {
			if (result.message) toast.success(result.message);
			return;
		}
		if ("status" in result && result.status === "error") {
			if (result.message) toast.error(result.message);
			return;
		}
		if ("error" in result && result.error) {
			toast.error(result.error);
			return;
		}
		if ("success" in result && result.success) {
			toast.success(result.success);
		}
	}, [result]);
}
