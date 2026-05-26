import { redirect } from "next/navigation";

import { SettingsTabs } from "~/app/configuracoes/settings-tabs";
import { AppShell } from "~/components/app-shell";
import { PageHeader } from "~/components/page-header";
import { getSession } from "~/server/better-auth/server";

export default async function ConfiguracoesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session?.user.id) redirect("/");

	return (
		<AppShell user={{ name: session.user.name, email: session.user.email }}>
			<PageHeader
				description="Política de mascaramento, histórico de alterações, sugestões da IA e ferramentas para exportar ou apagar seus dados."
				eyebrow="Configurações"
				title="Privacidade, auditoria e dados"
			/>
			<SettingsTabs />
			{children}
		</AppShell>
	);
}
