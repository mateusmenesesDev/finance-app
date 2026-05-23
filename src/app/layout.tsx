import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
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

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={geist.variable} lang="pt-BR" suppressHydrationWarning>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange
					enableSystem
				>
					<TRPCReactProvider>{children}</TRPCReactProvider>
					<Toaster position="top-right" richColors />
				</ThemeProvider>
			</body>
		</html>
	);
}
