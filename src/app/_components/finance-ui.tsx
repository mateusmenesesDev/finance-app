import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/better-auth";

const navigation = [
	{ href: "/", label: "Dashboard" },
	{ href: "/transactions", label: "Transações" },
	{ href: "/accounts", label: "Contas" },
	{ href: "/categories", label: "Categorias" },
	{ href: "/budgets", label: "Orçamento" },
	{ href: "/recurrences", label: "Recorrências" },
	{ href: "/cash-flow", label: "Fluxo de caixa" },
	{ href: "/import", label: "Importações" },
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
		<main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
				<header className="flex flex-col gap-5 border-slate-800 border-b pb-6 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="font-medium text-emerald-300 text-sm uppercase tracking-[0.3em]">
							{eyebrow}
						</p>
						<h1 className="mt-3 font-semibold text-4xl tracking-tight">
							{title}
						</h1>
						<p className="mt-3 max-w-3xl text-slate-300">{description}</p>
					</div>

					<div className="flex flex-col gap-3 lg:items-end">
						<nav className="flex flex-wrap gap-2">
							{navigation.map((item) => (
								<Link
									className="rounded-full border border-slate-700 px-4 py-2 font-medium text-sm transition hover:border-slate-500 hover:bg-slate-900"
									href={item.href}
									key={item.href}
								>
									{item.label}
								</Link>
							))}
						</nav>
						<form>
							<button
								className="rounded-full border border-slate-700 px-5 py-2 font-medium text-sm transition hover:border-slate-500 hover:bg-slate-900"
								formAction={async () => {
									"use server";
									await auth.api.signOut({ headers: await headers() });
									redirect("/");
								}}
								type="submit"
							>
								Sair
							</button>
						</form>
					</div>
				</header>
				{children}
			</div>
		</main>
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
		<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-xl">{title}</h2>
				{description ? (
					<p className="mt-1 text-slate-400 text-sm">{description}</p>
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
		default: "text-slate-100",
		good: "text-emerald-300",
		bad: "text-rose-300",
		warn: "text-amber-300",
	}[variant];

	return (
		<div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
			<p className="text-slate-400 text-sm">{label}</p>
			<p className={`mt-2 font-semibold text-2xl ${valueClass}`}>{value}</p>
			{description ? (
				<p className="mt-2 text-slate-500 text-xs">{description}</p>
			) : null}
		</div>
	);
}

export const inputClass =
	"rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input className={inputClass} {...props} />;
}

export function Select({
	options,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
	options: Record<string, string>;
}) {
	return (
		<select className={inputClass} {...props}>
			{Object.entries(options).map(([value, label]) => (
				<option key={value} value={value}>
					{label}
				</option>
			))}
		</select>
	);
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
	return (
		<button
			className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-slate-950 text-sm"
			type="submit"
		>
			{children}
		</button>
	);
}

export function BudgetProgress({ percent }: { percent: number }) {
	return (
		<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
			<div
				className="h-full rounded-full bg-emerald-400"
				style={{ width: `${Math.min(100, Math.max(0, percent * 100))}%` }}
			/>
		</div>
	);
}
