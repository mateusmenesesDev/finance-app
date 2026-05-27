import {
	ArrowDownUp,
	BarChart3,
	Bot,
	CreditCard,
	FileSpreadsheet,
	LayoutDashboard,
	LineChart,
	type LucideIcon,
	PiggyBank,
	Repeat,
	Settings,
	Tags,
	Wallet,
	Waves,
} from "lucide-react";

export type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	description?: string;
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

export const navGroups: NavGroup[] = [
	{
		label: "Operar",
		items: [
			{ href: "/", label: "Dashboard", icon: LayoutDashboard },
			{ href: "/transactions", label: "Transações", icon: ArrowDownUp },
			{ href: "/accounts", label: "Contas", icon: Wallet },
			{ href: "/cards", label: "Cartões", icon: CreditCard },
			{ href: "/categories", label: "Categorias", icon: Tags },
			{ href: "/import", label: "Importações", icon: FileSpreadsheet },
			{ href: "/budgets", label: "Orçamento", icon: PiggyBank },
			{ href: "/recurrences", label: "Recorrências", icon: Repeat },
		],
	},
	{
		label: "Analisar",
		items: [
			{ href: "/cash-flow", label: "Fluxo de caixa", icon: Waves },
			{ href: "/reports", label: "Relatórios", icon: BarChart3 },
			{ href: "/analysis", label: "Análise", icon: LineChart },
			{ href: "/assistente", label: "Assistente", icon: Bot },
		],
	},
];

export const settingsItem: NavItem = {
	href: "/configuracoes",
	label: "Configurações",
	icon: Settings,
};
