import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Finance App",
	description: "Controle pessoal de contas, transações e importações CSV.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const themeCookie = (await cookies()).get("finance-theme")?.value;
	const theme =
		themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

	return (
		<html
			className={`${geist.variable}`}
			data-theme={theme}
			lang="pt-BR"
			suppressHydrationWarning
		>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: small no-flash theme bootstrap before React hydrates.
					dangerouslySetInnerHTML={{
						__html: `try{var t=localStorage.getItem("finance-theme");if(t==="light"||t==="dark"||t==="system")document.documentElement.dataset.theme=t;}catch(e){}`,
					}}
				/>
			</head>
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
