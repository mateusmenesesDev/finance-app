"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const options = [
	{ value: "light", label: "Claro", icon: Sun },
	{ value: "dark", label: "Escuro", icon: Moon },
	{ value: "system", label: "Sistema", icon: Monitor },
] as const;

export function ThemeToggle() {
	const { theme, setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button aria-label="Alternar tema" size="icon" variant="ghost">
					<Icon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{options.map((option) => {
					const OptionIcon = option.icon;
					return (
						<DropdownMenuItem
							className={theme === option.value ? "font-medium" : undefined}
							key={option.value}
							onClick={() => setTheme(option.value)}
						>
							<OptionIcon className="size-4" />
							{option.label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
