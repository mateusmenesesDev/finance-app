import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getSession } from "~/server/better-auth/server";

const tabs = [
	{
		value: "privacidade",
		href: "/configuracoes/privacidade",
		label: "Privacidade",
	},
	{ value: "auditoria", href: "/configuracoes/auditoria", label: "Auditoria" },
	{
		value: "sugestoes",
		href: "/configuracoes/sugestoes",
		label: "Sugestões da IA",
	},
	{ value: "dados", href: "/configuracoes/dados", label: "Dados" },
];

export default async function ConfiguracoesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	const pathname = currentPathname(await headers());
	const activeTab = tabValueFromPath(pathname);

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Política de mascaramento, histórico de alterações, sugestões da IA e ferramentas para exportar ou apagar seus dados."
				eyebrow="Configurações"
				title="Privacidade, auditoria e dados"
			/>
			<Tabs value={activeTab}>
				<TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-fit">
					{tabs.map((tab) => (
						<TabsTrigger asChild key={tab.value} value={tab.value}>
							<Link href={tab.href}>{tab.label}</Link>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{children}
		</AppShell>
	);
}

function currentPathname(headersList: Headers) {
	return (
		headersList.get("x-pathname") ??
		headersList.get("x-invoke-path") ??
		headersList.get("next-url") ??
		"/configuracoes/privacidade"
	);
}

function tabValueFromPath(pathname: string) {
	const match = tabs.find((tab) => pathname.startsWith(tab.href));
	return match?.value ?? "privacidade";
}
