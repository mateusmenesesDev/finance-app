import { AppShell } from "~/components/app-shell";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

const statSkeletons = ["balance", "income", "expense", "forecast"];
const tableRows = ["one", "two", "three", "four", "five", "six"];

export function RouteLoadingSkeleton() {
	return (
		<AppShell>
			<div className="space-y-3">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-9 w-64 max-w-full" />
				<Skeleton className="h-4 w-full max-w-xl" />
			</div>

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{statSkeletons.map((key) => (
					<Card key={key}>
						<CardHeader className="space-y-3 pb-2">
							<div className="flex items-center justify-between gap-2">
								<Skeleton className="h-4 w-28" />
								<Skeleton className="size-8 rounded-md" />
							</div>
						</CardHeader>
						<CardContent className="space-y-2">
							<Skeleton className="h-8 w-32" />
							<Skeleton className="h-3 w-40 max-w-full" />
						</CardContent>
					</Card>
				))}
			</section>

			<div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
				<Card>
					<CardHeader className="space-y-2">
						<Skeleton className="h-5 w-48" />
						<Skeleton className="h-4 w-full max-w-md" />
					</CardHeader>
					<CardContent className="space-y-3">
						{tableRows.map((key) => (
							<Skeleton className="h-10 w-full" key={key} />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="space-y-2">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-4 w-full" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</Card>
			</div>
		</AppShell>
	);
}
