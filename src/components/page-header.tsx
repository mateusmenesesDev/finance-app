import { cn } from "~/lib/utils";

type Props = {
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: React.ReactNode;
	className?: string;
};

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	className,
}: Props) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between",
				className,
			)}
		>
			<div className="min-w-0 space-y-1">
				{eyebrow ? (
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
						{eyebrow}
					</p>
				) : null}
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{title}
				</h1>
				{description ? (
					<p className="max-w-3xl text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
		</div>
	);
}
