import type { LucideIcon } from "lucide-react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";

type Tone = "default" | "success" | "destructive" | "warning" | "info";

const valueClass: Record<Tone, string> = {
	default: "text-foreground",
	success: "text-success",
	destructive: "text-destructive",
	warning: "text-warning",
	info: "text-info",
};

const iconClass: Record<Tone, string> = {
	default: "bg-muted text-muted-foreground",
	success: "bg-success/10 text-success",
	destructive: "bg-destructive/10 text-destructive",
	warning: "bg-warning/10 text-warning",
	info: "bg-info/10 text-info",
};

type Props = {
	label: string;
	value: string;
	description?: string;
	tone?: Tone;
	icon?: LucideIcon;
	footer?: React.ReactNode;
};

export function StatCard({
	label,
	value,
	description,
	tone = "default",
	icon: Icon,
	footer,
}: Props) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
				<CardTitle className="font-medium text-muted-foreground text-sm">
					{label}
				</CardTitle>
				{Icon ? (
					<span
						className={cn(
							"flex size-8 items-center justify-center rounded-md",
							iconClass[tone],
						)}
					>
						<Icon className="size-4" />
					</span>
				) : null}
			</CardHeader>
			<CardContent className="space-y-1">
				<p
					className={cn(
						"font-semibold text-2xl tabular-nums",
						valueClass[tone],
					)}
				>
					{value}
				</p>
				{description ? (
					<CardDescription className="text-xs">{description}</CardDescription>
				) : null}
				{footer ? <div className="pt-2 text-xs">{footer}</div> : null}
			</CardContent>
		</Card>
	);
}
