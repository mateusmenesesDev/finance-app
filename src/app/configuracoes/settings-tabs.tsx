"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

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

function tabValueFromPath(pathname: string) {
	const match = tabs.find((tab) => pathname.startsWith(tab.href));
	return match?.value ?? "privacidade";
}

export function SettingsTabs() {
	const pathname = usePathname();
	const activeTab = tabValueFromPath(pathname);

	return (
		<Tabs value={activeTab}>
			<TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-fit">
				{tabs.map((tab) => (
					<TabsTrigger asChild key={tab.value} value={tab.value}>
						<Link href={tab.href}>{tab.label}</Link>
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
