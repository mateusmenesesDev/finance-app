import { eq } from "drizzle-orm";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import {
	categories,
	categoryGroups,
	financialAccounts,
	importBatches,
	importCategoryRules,
	importRows,
	importTemplates,
	monthlyBudgets,
	transactions,
	user,
} from "~/server/db/schema";
import {
	type CategoryKey,
	cardPurchases,
	categoryNames,
	currentExpenses,
	groupPlan,
} from "./seed-data";

const DEMO_EMAIL = "demo@finance.local";
const DEMO_PASSWORD = "Demo@123456";
type AccountKey = "corrente" | "poupanca" | "carteira" | "cartao" | "invest";
type InsertTransaction = typeof transactions.$inferInsert;
type InsertBudget = typeof monthlyBudgets.$inferInsert;
type ImportRowRecord = typeof importRows.$inferInsert;

type CreatedAccount = typeof financialAccounts.$inferSelect;
type CreatedCategory = typeof categories.$inferSelect;

const req = <T>(value: T | null | undefined, label: string): T => {
	if (value == null) throw new Error(`Seed inconsistente: ${label}`);
	return value;
};

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const atNoon = (year: number, monthIndex: number, day: number) =>
	new Date(Date.UTC(year, monthIndex, day, 12));
const addDays = (date: Date, days: number) => {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
};
const cents = (reais: number) => Math.round(reais * 100);

const monthStart = (monthsAgo: number) => {
	const now = new Date();
	return atNoon(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1);
};

const ensureDemoUser = async () => {
	const existing = await db.query.user.findFirst({
		where: eq(user.email, DEMO_EMAIL),
	});
	if (existing) return existing;

	await auth.api.signUpEmail({
		body: {
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD,
			name: "Pessoa Demo",
		},
		headers: new Headers({
			host: "localhost:3000",
		}),
	});

	const created = await db.query.user.findFirst({
		where: eq(user.email, DEMO_EMAIL),
	});
	if (!created) throw new Error("Better Auth não criou o usuário demo.");
	return created;
};

const resetDemoFinanceData = async (userId: string) => {
	await db.delete(transactions).where(eq(transactions.userId, userId));
	await db.delete(importRows).where(eq(importRows.userId, userId));
	await db.delete(importBatches).where(eq(importBatches.userId, userId));
	await db.delete(importTemplates).where(eq(importTemplates.userId, userId));
	await db
		.delete(importCategoryRules)
		.where(eq(importCategoryRules.userId, userId));
	await db.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userId));
	await db.delete(categories).where(eq(categories.userId, userId));
	await db.delete(categoryGroups).where(eq(categoryGroups.userId, userId));
	await db
		.delete(financialAccounts)
		.where(eq(financialAccounts.userId, userId));
};

const seedAccounts = async (userId: string) => {
	const rows = await db
		.insert(financialAccounts)
		.values([
			{
				userId,
				name: "Conta Corrente Principal",
				type: "checking",
				institution: "Banco Aurora",
				initialBalanceCents: cents(3200),
			},
			{
				userId,
				name: "Poupança Reserva",
				type: "savings",
				institution: "Banco Aurora",
				initialBalanceCents: cents(8500),
			},
			{
				userId,
				name: "Carteira",
				type: "cash",
				initialBalanceCents: cents(180),
			},
			{
				userId,
				name: "Cartão Azul Platinum",
				type: "credit_card",
				institution: "Banco Azul",
				initialBalanceCents: 0,
				creditCardClosingDay: 25,
				creditCardDueDay: 5,
			},
			{
				userId,
				name: "Investimentos Tesouro",
				type: "investment",
				institution: "Corretora Serra",
				initialBalanceCents: cents(12500),
			},
		])
		.returning();

	return {
		corrente: req(
			rows.find((row) => row.name === "Conta Corrente Principal"),
			"conta corrente",
		),
		poupanca: req(
			rows.find((row) => row.name === "Poupança Reserva"),
			"poupança",
		),
		carteira: req(
			rows.find((row) => row.name === "Carteira"),
			"carteira",
		),
		cartao: req(
			rows.find((row) => row.name === "Cartão Azul Platinum"),
			"cartão",
		),
		invest: req(
			rows.find((row) => row.name === "Investimentos Tesouro"),
			"investimentos",
		),
	} satisfies Record<AccountKey, CreatedAccount>;
};

const seedCategories = async (userId: string) => {
	const categoryByName = new Map<string, CreatedCategory>();

	for (const group of groupPlan) {
		const [createdGroup] = await db
			.insert(categoryGroups)
			.values({ userId, name: group.name, kind: group.kind })
			.returning();
		const groupId = req(createdGroup, group.name).id;

		const createdCategories = await db
			.insert(categories)
			.values(
				group.categories.map((name) => ({
					userId,
					groupId,
					name,
					kind: group.kind,
				})),
			)
			.returning();

		for (const category of createdCategories) {
			categoryByName.set(category.name, category);
		}
	}

	return Object.fromEntries(
		Object.entries(categoryNames).map(([key, name]) => [
			key,
			req(categoryByName.get(name), name),
		]),
	) as Record<CategoryKey, CreatedCategory>;
};

const expense = (
	userId: string,
	account: CreatedAccount,
	category: CreatedCategory,
	occurredOn: Date,
	amountReais: number,
	description: string,
): InsertTransaction => ({
	userId,
	accountId: account.id,
	categoryId: category.id,
	movementType: "expense",
	status: "confirmed",
	amountCents: cents(amountReais),
	occurredOn: ymd(occurredOn),
	description,
});

const income = (
	userId: string,
	account: CreatedAccount,
	category: CreatedCategory,
	occurredOn: Date,
	amountReais: number,
	description: string,
): InsertTransaction => ({
	userId,
	accountId: account.id,
	categoryId: category.id,
	movementType: "income",
	status: "confirmed",
	amountCents: cents(amountReais),
	occurredOn: ymd(occurredOn),
	description,
});

const buildTransactions = (
	userId: string,
	accounts: Record<AccountKey, CreatedAccount>,
	cats: Record<CategoryKey, CreatedCategory>,
) => {
	const rows: InsertTransaction[] = [];

	for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
		const start = monthStart(monthsAgo);
		rows.push(
			income(
				userId,
				accounts.corrente,
				cats.salario,
				addDays(start, 4),
				9200,
				"Salário mensal",
			),
			income(
				userId,
				accounts.corrente,
				cats.freelas,
				addDays(start, 17),
				700 + monthsAgo * 80,
				"Projeto freelance",
			),
		);
		for (const [
			accountKey,
			categoryKey,
			day,
			value,
			description,
		] of currentExpenses) {
			rows.push(
				expense(
					userId,
					accounts[accountKey],
					cats[categoryKey],
					addDays(start, day),
					value(monthsAgo),
					description,
				),
			);
		}
		for (const [categoryKey, day, value, description] of cardPurchases) {
			rows.push(
				expense(
					userId,
					accounts.cartao,
					cats[categoryKey],
					addDays(start, day),
					value + monthsAgo,
					description,
				),
			);
		}
		rows.push(
			{
				userId,
				accountId: accounts.corrente.id,
				destinationAccountId: accounts.poupanca.id,
				movementType: "transfer",
				status: "confirmed",
				amountCents: cents(950),
				occurredOn: ymd(addDays(start, 5)),
				description: "Reserva mensal",
			},
			{
				userId,
				accountId: accounts.corrente.id,
				destinationAccountId: accounts.invest.id,
				movementType: "transfer",
				status: "confirmed",
				amountCents: cents(600),
				occurredOn: ymd(addDays(start, 20)),
				description: "Aporte Tesouro Direto",
			},
			{
				userId,
				accountId: accounts.corrente.id,
				destinationAccountId: accounts.cartao.id,
				movementType: "credit_card_payment",
				status: "confirmed",
				amountCents: cents(2100 + monthsAgo * 90),
				occurredOn: ymd(addDays(start, 5)),
				description: "Pagamento fatura Cartão Azul",
			},
		);
	}

	rows.push(
		{
			userId,
			accountId: accounts.corrente.id,
			movementType: "balance_adjustment",
			status: "confirmed",
			amountCents: cents(37.42),
			occurredOn: ymd(addDays(monthStart(5), 1)),
			description: "Ajuste de saldo inicial",
			notes: "Conferência manual sem dado sensível.",
		},
		income(
			userId,
			accounts.poupanca,
			cats.rendimentos,
			addDays(monthStart(2), 28),
			83.17,
			"Rendimento poupança",
		),
	);

	return rows;
};

const seedBudgets = async (
	userId: string,
	cats: Record<CategoryKey, CreatedCategory>,
) => {
	const monthKey = ymd(monthStart(0)).slice(0, 7);
	const rows: InsertBudget[] = [
		{ userId, monthKey, scope: "month", amountCents: cents(8200) },
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.mercado.id,
			amountCents: cents(700),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.restaurante.id,
			amountCents: cents(220),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.aluguel.id,
			amountCents: cents(2500),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.energia.id,
			amountCents: cents(260),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.internet.id,
			amountCents: cents(140),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.uber.id,
			amountCents: cents(80),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.streaming.id,
			amountCents: cents(50),
		},
		{
			userId,
			monthKey,
			scope: "category",
			categoryId: cats.farmacia.id,
			amountCents: cents(120),
		},
	];

	await db.insert(monthlyBudgets).values(rows);
};

const seedImportDemo = async (
	userId: string,
	accounts: Record<AccountKey, CreatedAccount>,
	cats: Record<CategoryKey, CreatedCategory>,
) => {
	const [template] = await db
		.insert(importTemplates)
		.values({
			userId,
			name: "CSV Banco Aurora mascarado",
			sourceLabel: "Banco Aurora",
			config: {
				delimiter: ";",
				dateFormat: "dd/mm/yyyy",
				decimalSeparator: ",",
				amountMode: "signed",
				dateColumn: "Data",
				descriptionColumn: "Descrição",
				amountColumn: "Valor",
				kindColumn: "Tipo",
				externalIdColumn: "ID",
				categoryColumn: "Categoria",
				incomeTokens: ["credito", "receita", "entrada"],
				expenseTokens: ["debito", "despesa", "saida"],
				invertSign: false,
			},
		})
		.returning();
	const templateId = req(template, "template importação").id;

	const [mercadoRule, salarioRule] = await db
		.insert(importCategoryRules)
		.values([
			{
				userId,
				categoryId: cats.mercado.id,
				movementType: "expense",
				normalizedDescription: "mercado",
				priority: 10,
				matchCount: 4,
				acceptedCount: 3,
			},
			{
				userId,
				categoryId: cats.salario.id,
				movementType: "income",
				normalizedDescription: "salario",
				priority: 20,
				matchCount: 6,
				acceptedCount: 6,
			},
		])
		.returning();

	const confirmedRows: ImportRowRecord[] = [
		{
			userId,
			batchId: 0,
			accountId: accounts.corrente.id,
			rowNumber: 1,
			status: "imported",
			occurredOn: ymd(addDays(monthStart(1), 4)),
			amountCents: cents(9200),
			movementType: "income",
			originalDescription: "PIX RECEBIDO EMPRESA ***123",
			normalizedDescription: "pix recebido empresa",
			externalId: "aurora-demo-2026-001-masked",
			bankCategory: "Crédito",
			suggestedCategoryId: cats.salario.id,
			suggestedRuleId: req(salarioRule, "regra salário").id,
			suggestionSource: "rule",
			parsedData: { agencia: "***", conta: "****-0", hadSensitiveData: true },
		},
		{
			userId,
			batchId: 0,
			accountId: accounts.corrente.id,
			rowNumber: 2,
			status: "duplicate",
			occurredOn: ymd(addDays(monthStart(1), 6)),
			amountCents: cents(2500),
			movementType: "expense",
			originalDescription: "TED ALUGUEL IMOBILIARIA ***",
			normalizedDescription: "ted aluguel imobiliaria",
			externalId: "aurora-demo-2026-002-masked",
			bankCategory: "Débito",
			validationError: "Possível duplicidade por data, valor e descrição.",
			parsedData: { documento: "***.***.***-**", hadSensitiveData: true },
		},
	];

	const [confirmedBatch] = await db
		.insert(importBatches)
		.values({
			userId,
			importTemplateId: templateId,
			accountId: accounts.corrente.id,
			status: "confirmed",
			originalFileName: "extrato-aurora-mascarado-confirmado.csv",
			sourceLabel: "Banco Aurora",
			rowCount: confirmedRows.length,
			rawFileStored: false,
			suggestionCount: 2,
			suggestionAcceptedCount: 1,
			confirmedAt: new Date(),
		})
		.returning();
	const confirmedBatchId = req(confirmedBatch, "lote confirmado").id;

	const createdConfirmedRows = await db
		.insert(importRows)
		.values(confirmedRows.map((row) => ({ ...row, batchId: confirmedBatchId })))
		.returning();
	const importedRow = req(
		createdConfirmedRows.find((row) => row.status === "imported"),
		"linha importada",
	);

	await db.insert(transactions).values({
		userId,
		accountId: accounts.corrente.id,
		categoryId: cats.salario.id,
		importBatchId: confirmedBatchId,
		importRowId: importedRow.id,
		movementType: "income",
		status: "confirmed",
		amountCents: cents(9200),
		occurredOn: req(importedRow.occurredOn, "data linha importada"),
		originalDescription: importedRow.originalDescription ?? undefined,
		description: "Salário importado do extrato",
		externalId: importedRow.externalId ?? undefined,
	});

	const reviewingRows: ImportRowRecord[] = [
		{
			userId,
			batchId: 0,
			accountId: accounts.cartao.id,
			rowNumber: 1,
			status: "valid",
			occurredOn: ymd(addDays(monthStart(0), 2)),
			amountCents: cents(86.5),
			movementType: "expense",
			originalDescription: "RESTAURANTE CANTINHO CARTAO **** 4321",
			normalizedDescription: "restaurante cantinho cartao",
			externalId: "azul-demo-001-masked",
			bankCategory: "Alimentação",
			suggestedCategoryId: cats.restaurante.id,
			suggestionSource: "heuristic",
			parsedData: { cartao: "**** 4321", hadSensitiveData: true },
		},
		{
			userId,
			batchId: 0,
			accountId: accounts.cartao.id,
			rowNumber: 2,
			status: "pending_review",
			occurredOn: ymd(addDays(monthStart(0), 4)),
			amountCents: cents(219.9),
			movementType: "expense",
			originalDescription: "COMPRA ONLINE LOJA *** PEDIDO #***",
			normalizedDescription: "compra online loja",
			externalId: "azul-demo-002-masked",
			bankCategory: "Compras",
			parsedData: { cartao: "**** 4321", hadSensitiveData: true },
		},
		{
			userId,
			batchId: 0,
			accountId: accounts.cartao.id,
			rowNumber: 3,
			status: "invalid",
			originalDescription: "LINHA SEM DATA;VALOR;DESCRICAO",
			normalizedDescription: "linha sem data valor descricao",
			validationError: "Data ausente no CSV mascarado.",
			parsedData: { raw: "***;***;***" },
		},
		{
			userId,
			batchId: 0,
			accountId: accounts.cartao.id,
			rowNumber: 4,
			status: "ignored",
			occurredOn: ymd(addDays(monthStart(0), 5)),
			amountCents: cents(0.01),
			movementType: "expense",
			originalDescription: "SALDO ANTERIOR MASCARADO",
			normalizedDescription: "saldo anterior mascarado",
			validationError: "Linha informativa ignorada pelo usuário.",
		},
		{
			userId,
			batchId: 0,
			accountId: accounts.cartao.id,
			rowNumber: 5,
			status: "duplicate",
			occurredOn: ymd(addDays(monthStart(0), 7)),
			amountCents: cents(218.73),
			movementType: "expense",
			originalDescription: "MERCADO PAO DA ESQUINA ****4321",
			normalizedDescription: "mercado pao da esquina",
			externalId: "azul-demo-005-masked",
			bankCategory: "Mercado",
			parsedData: { cartao: "**** 4321", hadSensitiveData: true },
			suggestedCategoryId: cats.mercado.id,
			suggestedRuleId: req(mercadoRule, "regra mercado").id,
			suggestionSource: "rule",
			validationError: "Compra já lançada manualmente.",
		},
	];

	const [reviewingBatch] = await db
		.insert(importBatches)
		.values({
			userId,
			importTemplateId: templateId,
			accountId: accounts.cartao.id,
			status: "reviewing",
			originalFileName: "fatura-azul-mascarada-em-revisao.csv",
			sourceLabel: "Banco Azul",
			rowCount: reviewingRows.length,
			rawFileStored: false,
			suggestionCount: 3,
			suggestionAcceptedCount: 0,
			suggestionRejectedCount: 1,
		})
		.returning();
	const reviewingBatchId = req(reviewingBatch, "lote em revisão").id;

	await db
		.insert(importRows)
		.values(
			reviewingRows.map((row) => ({ ...row, batchId: reviewingBatchId })),
		);
};

const main = async () => {
	const demoUser = await ensureDemoUser();
	await resetDemoFinanceData(demoUser.id);
	const accounts = await seedAccounts(demoUser.id);
	const cats = await seedCategories(demoUser.id);
	const baseTransactions = buildTransactions(demoUser.id, accounts, cats);
	await db.insert(transactions).values(baseTransactions);
	await seedBudgets(demoUser.id, cats);
	await seedImportDemo(demoUser.id, accounts, cats);

	console.log(
		`Seed local concluído para ${DEMO_EMAIL}: 5 contas, 11 grupos, 39 categorias, 9 orçamentos, ${baseTransactions.length} transações base + 1 transação importada.`,
	);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
