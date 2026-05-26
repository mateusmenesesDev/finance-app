"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "~/app/_actions/auth-actions";
import { authClient } from "~/server/better-auth/client";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

function initials(name: string) {
	const parts = name.trim().split(/\s+/).slice(0, 2);
	if (!parts[0]) return "?";
	return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

type Props = {
	name?: string;
	email?: string;
};

export function UserMenu({ name: nameProp, email: emailProp }: Props) {
	const { data: session } = authClient.useSession();
	const name = nameProp ?? session?.user.name ?? "";
	const email = emailProp ?? session?.user.email ?? "";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button aria-label="Menu do usuário" size="icon" variant="ghost">
					<Avatar className="size-8">
						<AvatarFallback>{initials(name || email)}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel className="flex flex-col gap-0.5">
					<span className="truncate font-medium">{name || "Usuário"}</span>
					<span className="truncate text-muted-foreground text-xs">
						{email}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/configuracoes">
						<Settings />
						Configurações
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link href="/configuracoes/privacidade">
						<User />
						Privacidade
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<form action={signOutAction}>
					<DropdownMenuItem asChild>
						<button className="w-full" type="submit">
							<LogOut />
							Sair
						</button>
					</DropdownMenuItem>
				</form>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
