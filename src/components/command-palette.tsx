"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { navGroups, settingsItem } from "~/components/app-nav";
import { Button } from "~/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "~/components/ui/command";

export function CommandPalette() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (
				(event.key === "k" || event.key === "K") &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	function go(href: string) {
		setOpen(false);
		router.push(href);
	}

	function submitSearch() {
		const trimmed = query.trim();
		if (!trimmed) return;
		setOpen(false);
		router.push(`/search?q=${encodeURIComponent(trimmed)}`);
	}

	return (
		<>
			<Button
				className="hidden h-9 w-64 justify-start gap-2 text-muted-foreground md:flex"
				onClick={() => setOpen(true)}
				type="button"
				variant="outline"
			>
				<Search className="size-4" />
				<span className="flex-1 text-left">Buscar...</span>
				<kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground sm:flex">
					<span className="text-xs">⌘</span>K
				</kbd>
			</Button>
			<Button
				aria-label="Buscar"
				className="md:hidden"
				onClick={() => setOpen(true)}
				size="icon"
				type="button"
				variant="ghost"
			>
				<Search className="size-4" />
			</Button>

			<CommandDialog onOpenChange={setOpen} open={open}>
				<CommandInput
					onKeyDown={(event) => {
						if (event.key === "Enter" && query.trim()) {
							event.preventDefault();
							submitSearch();
						}
					}}
					onValueChange={setQuery}
					placeholder="Buscar transações, contas ou ir para uma página..."
					value={query}
				/>
				<CommandList>
					<CommandEmpty>Nada encontrado.</CommandEmpty>
					{query.trim() ? (
						<CommandGroup heading="Buscar">
							<CommandItem onSelect={submitSearch}>
								<Search />
								<span>Buscar por "{query.trim()}"</span>
							</CommandItem>
						</CommandGroup>
					) : null}
					{navGroups.map((group) => (
						<CommandGroup heading={group.label} key={group.label}>
							{group.items.map((item) => {
								const Icon = item.icon;
								return (
									<CommandItem
										key={item.href}
										onSelect={() => go(item.href)}
										value={`${group.label} ${item.label}`}
									>
										<Icon />
										<span>{item.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					))}
					<CommandSeparator />
					<CommandGroup heading="Sistema">
						<CommandItem onSelect={() => go(settingsItem.href)}>
							<settingsItem.icon />
							<span>{settingsItem.label}</span>
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
