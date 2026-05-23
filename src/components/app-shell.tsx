import { AppSidebar } from "~/components/app-sidebar";
import { CommandPalette } from "~/components/command-palette";
import { ThemeToggle } from "~/components/theme-toggle";
import { Separator } from "~/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "~/components/ui/sidebar";
import { UserMenu } from "~/components/user-menu";

type Props = {
	user: { name: string; email: string };
	children: React.ReactNode;
};

export function AppShell({ user, children }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
					<SidebarTrigger className="-ml-1" />
					<Separator
						className="mr-2 data-[orientation=vertical]:h-4"
						orientation="vertical"
					/>
					<div className="ml-auto flex items-center gap-2">
						<CommandPalette />
						<ThemeToggle />
						<UserMenu email={user.email} name={user.name} />
					</div>
				</header>
				<main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
