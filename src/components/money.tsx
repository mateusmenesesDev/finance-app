import { formatMoney } from "~/lib/formatters";
import { cn } from "~/lib/utils";

type Tone = "auto" | "positive" | "negative" | "muted" | "neutral";

type Props = {
	/** value in centavos (positive integer); use `sign` to indicate direction. */
	cents: number;
	sign?: "credit" | "debit" | "neutral";
	tone?: Tone;
	withSign?: boolean;
	className?: string;
};

/**
 * Renders monetary amounts with finance-friendly sign coloring.
 * `auto` derives color from `sign` (credit→success, debit→destructive, neutral→muted).
 */
export function Money({
	cents,
	sign = "neutral",
	tone = "auto",
	withSign = false,
	className,
}: Props) {
	const effectiveTone: Tone =
		tone === "auto"
			? sign === "credit"
				? "positive"
				: sign === "debit"
					? "negative"
					: "neutral"
			: tone;

	const prefix =
		withSign && sign === "credit"
			? "+"
			: withSign && sign === "debit"
				? "-"
				: "";

	const toneClass: Record<Tone, string> = {
		auto: "",
		positive: "text-success",
		negative: "text-destructive",
		muted: "text-muted-foreground",
		neutral: "text-foreground",
	};

	return (
		<span className={cn("tabular-nums", toneClass[effectiveTone], className)}>
			{prefix}
			{formatMoney(cents)}
		</span>
	);
}
