import Link from "next/link";

import { FinanceShell } from "~/app/_components/finance-ui";

const tabs = [
	{ href: "/configuracoes/privacidade", label: "Privacidade" },
	{ href: "/configuracoes/auditoria", label: "Auditoria" },
	{ href: "/configuracoes/sugestoes", label: "Sugestões da IA" },
	{ href: "/configuracoes/dados", label: "Dados" },
];

export default function ConfiguracoesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<FinanceShell
			description="Política de mascaramento, histórico de alterações, sugestões da IA e ferramentas para exportar ou apagar seus dados."
			eyebrow="Configurações"
			title="Privacidade, auditoria e dados"
		>
			<nav className="flex flex-wrap gap-2 border-[color:var(--color-border-subtle)] border-b pb-4">
				{tabs.map((tab) => (
					<Link
						className="rounded-full border border-[color:var(--color-border)] px-4 py-2 font-medium text-[color:var(--color-text)] text-sm transition hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-surface)]"
						href={tab.href}
						key={tab.href}
					>
						{tab.label}
					</Link>
				))}
			</nav>
			{children}
		</FinanceShell>
	);
}
