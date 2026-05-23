export const categoryNames = {
	salario: "Salário",
	freelas: "Freelas",
	rendimentos: "Rendimentos",
	mercado: "Mercado",
	restaurante: "Restaurante",
	aluguel: "Aluguel",
	condominio: "Condomínio",
	energia: "Energia",
	internet: "Internet",
	transporte: "Transporte",
	combustivel: "Combustível",
	uber: "Uber",
	saude: "Saúde",
	farmacia: "Farmácia",
	academia: "Academia",
	lazer: "Lazer",
	streaming: "Streaming",
	software: "Software",
	educacao: "Educação",
	pets: "Pets",
	roupas: "Roupas",
	presentes: "Presentes",
} as const;

export type CategoryKey = keyof typeof categoryNames;

type GroupPlan = Array<{
	name: string;
	kind: "income" | "expense";
	cashFlowRole?: "operational" | "financial";
	categories: string[];
}>;

export const groupPlan = [
	{
		name: "Renda",
		kind: "income" as const,
		cashFlowRole: "operational" as const,
		categories: ["Salário", "Freelas", "Reembolso"],
	},
	{
		name: "Rendimentos financeiros",
		kind: "income" as const,
		cashFlowRole: "financial" as const,
		categories: ["Rendimentos", "Juros", "Dividendos"],
	},
	{
		name: "Moradia",
		kind: "expense" as const,
		categories: ["Aluguel", "Condomínio", "Energia", "Internet", "Manutenção"],
	},
	{
		name: "Alimentação",
		kind: "expense" as const,
		categories: ["Mercado", "Restaurante", "Padaria", "Café"],
	},
	{
		name: "Transporte",
		kind: "expense" as const,
		categories: ["Transporte", "Combustível", "Uber", "Estacionamento"],
	},
	{
		name: "Saúde",
		kind: "expense" as const,
		categories: ["Saúde", "Farmácia", "Academia"],
	},
	{
		name: "Lazer",
		kind: "expense" as const,
		categories: ["Lazer", "Streaming", "Viagem", "Cinema"],
	},
	{
		name: "Educação",
		kind: "expense" as const,
		categories: ["Educação", "Livros", "Cursos"],
	},
	{
		name: "Família e casa",
		kind: "expense" as const,
		categories: ["Pets", "Roupas", "Presentes", "Casa"],
	},
	{
		name: "Serviços",
		kind: "expense" as const,
		categories: ["Assinaturas", "Tarifas bancárias", "Software"],
	},
	{
		name: "Impostos e seguros",
		kind: "expense" as const,
		categories: ["Impostos", "Seguro", "Documentos"],
	},
	{
		name: "Doações",
		kind: "expense" as const,
		categories: ["Doações", "Ajuda familiar"],
	},
] satisfies GroupPlan;

export const currentExpenses = [
	["corrente", "aluguel", 6, () => 2500, "Aluguel apartamento"],
	["corrente", "condominio", 8, () => 620, "Condomínio residencial"],
	["corrente", "energia", 12, (m: number) => 210 + m * 7, "Conta de energia"],
	["corrente", "internet", 15, () => 119.9, "Internet fibra"],
	["corrente", "mercado", 3, () => 286.4, "Supermercado Vila"],
	["corrente", "mercado", 18, () => 342.15, "Feira e hortifruti"],
	["carteira", "transporte", 10, () => 45, "Bilhete transporte"],
] satisfies Array<
	[
		"corrente" | "carteira",
		CategoryKey,
		number,
		(monthsAgo: number) => number,
		string,
	]
>;

export const cardPurchases = [
	["restaurante", 2, 86.5, "Restaurante Cantinho"],
	["mercado", 7, 218.73, "Mercado Pão da Esquina"],
	["uber", 9, 32.9, "App transporte urbano"],
	["streaming", 11, 39.9, "Streaming filmes"],
	["farmacia", 14, 74.2, "Farmácia Popular"],
	["lazer", 16, 64, "Cinema e pipoca"],
	["educacao", 19, 149.9, "Curso online"],
	["pets", 22, 128.4, "Ração pet shop"],
	["roupas", 24, 189.9, "Loja de roupas"],
	["presentes", 27, 95.5, "Presente aniversário"],
	["combustivel", 28, 210, "Posto Avenida"],
	["saude", 13, 155.8, "Consulta clínica"],
	["transporte", 21, 58.2, "Recarga mobilidade"],
] satisfies Array<[CategoryKey, number, number, string]>;
