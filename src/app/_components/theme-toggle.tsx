"use client";

import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark" | "system";

const themes: { value: ThemePreference; label: string }[] = [
	{ value: "system", label: "Sistema" },
	{ value: "light", label: "Claro" },
	{ value: "dark", label: "Escuro" },
];

function readInitialTheme(): ThemePreference {
	if (typeof document === "undefined") return "system";
	const value = document.documentElement.dataset.theme;
	return value === "light" || value === "dark" || value === "system"
		? value
		: "system";
}

function applyTheme(theme: ThemePreference) {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem("finance-theme", theme);
	// biome-ignore lint/suspicious/noDocumentCookie: cookie lets the server render the saved theme before hydration.
	document.cookie = `finance-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<ThemePreference>("system");

	useEffect(() => {
		const stored = localStorage.getItem("finance-theme");
		const initial =
			stored === "light" || stored === "dark" || stored === "system"
				? stored
				: readInitialTheme();
		setTheme(initial);
		applyTheme(initial);
	}, []);

	return (
		<label className="flex items-center gap-2 text-[color:var(--color-text-muted)] text-sm">
			Tema
			<select
				aria-label="Tema"
				className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-[color:var(--color-text)] text-sm"
				onChange={(event) => {
					const nextTheme = event.target.value as ThemePreference;
					setTheme(nextTheme);
					applyTheme(nextTheme);
				}}
				value={theme}
			>
				{themes.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}
