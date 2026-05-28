import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

export function PublicLoadingSkeleton() {
	return (
		<main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-3">
					<Skeleton className="mx-auto size-10 rounded-md" />
					<Skeleton className="mx-auto h-7 w-48" />
					<Skeleton className="mx-auto h-4 w-64 max-w-full" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</CardContent>
			</Card>
		</main>
	);
}
