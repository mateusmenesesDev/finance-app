"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	pendingLabel?: string;
	variant?: "primary" | "danger" | "secondary";
};

const variantClasses = {
	primary:
		"bg-[color:var(--color-accent-strong)] text-[color:var(--color-accent-text)] hover:opacity-90",
	danger:
		"border border-[color:var(--color-bad-border)] text-[color:var(--color-bad)] hover:bg-[color:var(--color-surface-muted)]",
	secondary:
		"border border-[color:var(--color-border)] text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-muted)]",
};

export function SubmitButton({
	children,
	className,
	pendingLabel = "Salvando...",
	variant = "primary",
	...props
}: SubmitButtonProps) {
	const { pending } = useFormStatus();
	const label = pending ? pendingLabel : children;

	return (
		<button
			{...props}
			aria-busy={pending}
			aria-disabled={pending || props.disabled}
			className={[
				"rounded-xl px-4 py-2 font-medium text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
				variantClasses[variant],
				className,
			]
				.filter(Boolean)
				.join(" ")}
			disabled={pending || props.disabled}
			type={props.type ?? "submit"}
		>
			{label}
			<span aria-live="polite" className="sr-only" role="status">
				{pending ? pendingLabel : ""}
			</span>
		</button>
	);
}

export function DangerSubmitButton(props: Omit<SubmitButtonProps, "variant">) {
	return (
		<SubmitButton pendingLabel="Arquivando..." variant="danger" {...props} />
	);
}
