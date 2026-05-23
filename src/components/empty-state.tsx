import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

type Props = {
	icon?: LucideIcon;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
};

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: Props) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center",
				className,
			)}
		>
			{Icon ? (
				<span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<Icon className="size-6" />
				</span>
			) : null}
			<div className="space-y-1">
				<p className="font-medium text-base">{title}</p>
				{description ? (
					<p className="max-w-md text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="pt-1">{action}</div> : null}
		</div>
	);
}
