import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
	DangerSubmitButton,
	SubmitButton,
} from "~/app/_components/pending-submit-button";
import { ThemeToggle } from "~/app/_components/theme-toggle";
import { auth } from "~/server/better-auth";

export { DangerSubmitButton, SubmitButton };

const primaryNavigation = [
	{ href: "/", label: "Dashboard" },
	{ href: "/transactions", label: "Transações" },
	{ href: "/accounts", label: "Contas" },
	{ href: "/import", label: "Importações" },
	{ href: "/categories", label: "Categorias" },
	{ href: "/reports", label: "Relatórios" },
];

const secondaryNavigation = [
	{ href: "/budgets", label: "Orçamento" },
	{ href: "/recurrences", label: "Recorrências" },
	{ href: "/cash-flow", label: "Fluxo de caixa" },
	{ href: "/analysis", label: "Análise" },
	{ href: "/assistente", label: "Assistente" },
	{ href: "/configuracoes", label: "Configurações" },
];

export function FinanceShell({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<main className="min-h-screen bg-[color:var(--color-bg)] px-4 py-6 text-[color:var(--color-text)] sm:px-6 lg:py-10">
			<div className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
				<header className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-4 shadow-sm sm:p-6">
					<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
						<div className="min-w-0">
							<p className="font-medium text-[color:var(--color-accent)] text-sm uppercase tracking-[0.3em]">
								{eyebrow}
							</p>
							<h1 className="mt-3 font-semibold text-3xl tracking-tight sm:text-4xl">
								{title}
							</h1>
							<p className="mt-3 max-w-3xl text-[color:var(--color-text-muted)]">
								{description}
							</p>
						</div>

						<div className="flex flex-col gap-3 lg:w-[30rem] lg:items-end">
							<div className="flex w-full flex-wrap items-center justify-end gap-2">
								<search className="min-w-0 flex-1 sm:min-w-80">
									<form action="/search" className="flex gap-2">
										<label className="sr-only" htmlFor="global-search">
											Buscar
										</label>
										<input
											className="min-w-0 flex-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-[color:var(--color-text)] text-sm"
											id="global-search"
											name="q"
											placeholder="Buscar transações, contas..."
										/>
										<button
											className="rounded-full border border-[color:var(--color-border)] px-4 py-2 font-medium text-sm hover:bg-[color:var(--color-surface-muted)]"
											type="submit"
										>
											Buscar
										</button>
									</form>
								</search>
								<ThemeToggle />
								<form>
									<SubmitButton
										className="rounded-full px-5"
										formAction={async () => {
											"use server";
											await auth.api.signOut({ headers: await headers() });
											redirect("/");
										}}
										pendingLabel="Saindo..."
										variant="secondary"
									>
										Sair
									</SubmitButton>
								</form>
							</div>

							<details className="w-full md:hidden">
								<summary className="cursor-pointer list-none rounded-2xl border border-[color:var(--color-border)] px-4 py-3 text-center font-medium text-sm transition hover:bg-[color:var(--color-surface-muted)]">
									Menu
								</summary>
								<nav
									aria-label="Navegação principal móvel"
									className="mt-3 grid gap-2 rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg)] p-2"
								>
									{primaryNavigation.map((item) => (
										<NavLink href={item.href} key={item.href}>
											{item.label}
										</NavLink>
									))}
									<div className="my-1 h-px bg-[color:var(--color-border-subtle)]" />
									{secondaryNavigation.map((item) => (
										<NavLink href={item.href} key={item.href} tone="muted">
											{item.label}
										</NavLink>
									))}
								</nav>
							</details>
						</div>
					</div>

					<nav
						aria-label="Navegação principal"
						className="mt-6 hidden items-center gap-2 border-[color:var(--color-border-subtle)] border-t pt-4 md:flex"
					>
						<div className="flex flex-1 flex-wrap gap-2">
							{primaryNavigation.map((item) => (
								<NavLink href={item.href} key={item.href}>
									{item.label}
								</NavLink>
							))}
						</div>
						<details className="relative">
							<summary className="cursor-pointer list-none rounded-full border border-[color:var(--color-border)] px-4 py-2 font-medium text-sm transition hover:bg-[color:var(--color-surface-muted)]">
								Mais
							</summary>
							<div className="absolute right-0 z-10 mt-2 grid min-w-48 gap-1 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 shadow-lg">
								{secondaryNavigation.map((item) => (
									<Link
										className="rounded-xl px-3 py-2 text-sm hover:bg-[color:var(--color-surface-muted)]"
										href={item.href}
										key={item.href}
									>
										{item.label}
									</Link>
								))}
							</div>
						</details>
					</nav>
				</header>
				{children}
			</div>
		</main>
	);
}

function NavLink({
	href,
	children,
	tone = "default",
}: {
	href: string;
	children: React.ReactNode;
	tone?: "default" | "muted";
}) {
	const className = [
		"rounded-full border px-4 py-2 font-medium text-sm transition hover:bg-[color:var(--color-surface-muted)]",
		tone === "muted"
			? "border-transparent text-[color:var(--color-text-muted)]"
			: "border-[color:var(--color-border)]",
	].join(" ");

	return (
		<Link className={className} href={href}>
			{children}
		</Link>
	);
}

export function Panel({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-3xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-xl">{title}</h2>
				{description ? (
					<p className="mt-1 text-[color:var(--color-text-subtle)] text-sm">
						{description}
					</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

export function SummaryCard({
	label,
	value,
	description,
	variant = "default",
}: {
	label: string;
	value: string;
	description?: string;
	variant?: "default" | "good" | "bad" | "warn";
}) {
	const valueClass = {
		default: "text-[color:var(--color-text)]",
		good: "text-[color:var(--color-good)]",
		bad: "text-[color:var(--color-bad)]",
		warn: "text-[color:var(--color-warn)]",
	}[variant];

	return (
		<div className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-muted)] p-4">
			<p className="text-[color:var(--color-text-subtle)] text-sm">{label}</p>
			<p className={`mt-2 font-semibold text-2xl ${valueClass}`}>{value}</p>
			{description ? (
				<p className="mt-2 text-[color:var(--color-text-subtle)] text-xs">
					{description}
				</p>
			) : null}
		</div>
	);
}

export const inputClass =
	"rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-[color:var(--color-text)] text-sm";

export function TextInput({
	className,
	...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={[inputClass, className].filter(Boolean).join(" ")}
			{...props}
		/>
	);
}

export function Select({
	options,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
	options: Record<string, string>;
}) {
	const className = [inputClass, props.className].filter(Boolean).join(" ");

	return (
		<select {...props} className={className}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

export function BudgetProgress({ percent }: { percent: number }) {
	return (
		<div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--color-border-subtle)]">
			<div
				className="h-full rounded-full bg-[color:var(--color-accent)]"
				style={{ width: `${Math.min(100, Math.max(0, percent * 100))}%` }}
			/>
		</div>
	);
}
