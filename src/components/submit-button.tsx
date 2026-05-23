"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "~/components/ui/button";

type Props = ComponentProps<typeof Button> & {
	pendingLabel?: string;
};

/**
 * Submit button that disables itself and shows a spinner while the parent form
 * is pending (server action in flight). Uses shadcn Button under the hood.
 */
export function SubmitButton({
	children,
	pendingLabel,
	disabled,
	...props
}: Props) {
	const { pending } = useFormStatus();
	return (
		<Button
			{...props}
			aria-busy={pending}
			disabled={pending || disabled}
			type={props.type ?? "submit"}
		>
			{pending ? (
				<>
					<Loader2 className="size-4 animate-spin" />
					{pendingLabel ?? children}
				</>
			) : (
				children
			)}
		</Button>
	);
}

export function DangerSubmitButton(props: Omit<Props, "variant">) {
	return (
		<SubmitButton
			pendingLabel={props.pendingLabel ?? "Arquivando..."}
			variant="destructive"
			{...props}
		/>
	);
}
