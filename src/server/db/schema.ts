import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	pgTableCreator,
	text,
	timestamp,
	unique,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

export const createFinanceTable = pgTableCreator(
	(name) => `finance_app_${name}`,
);

export const accountType = pgEnum("finance_app_account_type", [
	"checking",
	"savings",
	"cash",
	"credit_card",
	"investment",
]);

export const cardEntryKind = pgEnum("finance_app_card_entry_kind", [
	"charge",
	"credit",
]);

export const categoryKind = pgEnum("finance_app_category_kind", [
	"income",
	"expense",
]);

export const categoryGroupCashFlowRole = pgEnum(
	"finance_app_category_group_cash_flow_role",
	["operational", "financial"],
);

export const monthlyBudgetScope = pgEnum("finance_app_monthly_budget_scope", [
	"month",
	"category_group",
	"category",
]);

export const movementType = pgEnum("finance_app_movement_type", [
	"income",
	"expense",
	"transfer",
	"credit_card_payment",
	"balance_adjustment",
]);

export const recurrenceFrequency = pgEnum("finance_app_recurrence_frequency", [
	"once",
	"weekly",
	"monthly",
	"yearly",
]);

export const transactionStatus = pgEnum("finance_app_transaction_status", [
	"planned",
	"confirmed",
	"ignored",
	"duplicate",
	"pending_review",
]);

export const importBatchStatus = pgEnum("finance_app_import_batch_status", [
	"draft",
	"reviewing",
	"confirmed",
	"cancelled",
	"reverted",
]);

export const importRowStatus = pgEnum("finance_app_import_row_status", [
	"pending_review",
	"valid",
	"invalid",
	"ignored",
	"duplicate",
	"imported",
]);

export const importRuleTextMatchMode = pgEnum(
	"finance_app_import_rule_text_match_mode",
	["contains", "exact"],
);

export const importRuleAction = pgEnum("finance_app_import_rule_action", [
	"categorize",
	"ignore",
	"transfer",
]);

export const assistantSuggestionKind = pgEnum(
	"finance_app_assistant_suggestion_kind",
	[
		"category_for_transaction",
		"category_rule",
		"anomaly",
		"savings_opportunity",
	],
);

export const auditEntityType = pgEnum("finance_app_audit_entity_type", [
	"transaction",
	"financial_account",
	"import_batch",
	"assistant_suggestion",
	"user_data",
]);

export const auditAction = pgEnum("finance_app_audit_action", [
	"created",
	"updated",
	"archived",
	"restored",
	"deleted",
	"sanitized",
	"purged",
]);

export const transactionSavedFilterSort = pgEnum(
	"finance_app_transaction_saved_filter_sort",
	["date", "value", "category"],
);

export const assistantSuggestionStatus = pgEnum(
	"finance_app_assistant_suggestion_status",
	["pending", "accepted", "rejected", "superseded"],
);

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified")
		.$defaultFn(() => false)
		.notNull(),
	image: text("image"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
	updatedAt: timestamp("updated_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
});

export const financialAccounts = createFinanceTable(
	"accounts",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		type: accountType().notNull(),
		institution: varchar({ length: 120 }),
		initialBalanceCents: integer("initial_balance_cents").notNull().default(0),
		currency: varchar({ length: 3 }).notNull().default("BRL"),
		isActive: boolean("is_active").notNull().default(true),
		isArchived: boolean("is_archived").notNull().default(false),
		creditCardClosingDay: integer("credit_card_closing_day"),
		creditCardDueDay: integer("credit_card_due_day"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_accounts_user_idx").on(t.userId),
		index("finance_app_accounts_user_active_idx").on(t.userId, t.isActive),
		unique("finance_app_accounts_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_accounts_user_name_idx").on(t.userId, t.name),
		check(
			"finance_app_accounts_initial_balance_cents_non_negative",
			sql`${t.initialBalanceCents} >= 0`,
		),
		check(
			"finance_app_accounts_closing_day_valid",
			sql`${t.creditCardClosingDay} IS NULL OR (${t.creditCardClosingDay} >= 1 AND ${t.creditCardClosingDay} <= 31)`,
		),
		check(
			"finance_app_accounts_due_day_valid",
			sql`${t.creditCardDueDay} IS NULL OR (${t.creditCardDueDay} >= 1 AND ${t.creditCardDueDay} <= 31)`,
		),
	],
);

export const creditCards = createFinanceTable(
	"cards",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		institution: varchar({ length: 120 }),
		closingDay: integer("closing_day").notNull(),
		dueDay: integer("due_day").notNull(),
		limitCents: integer("limit_cents"),
		defaultPaymentAccountId: integer("default_payment_account_id"),
		legacyAccountId: integer("legacy_account_id"),
		isActive: boolean("is_active").notNull().default(true),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_cards_user_idx").on(t.userId),
		index("finance_app_cards_user_active_idx").on(t.userId, t.isActive),
		unique("finance_app_cards_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_cards_user_name_idx").on(t.userId, t.name),
		foreignKey({
			columns: [t.defaultPaymentAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_cards_default_payment_account_user_fk",
		}),
		foreignKey({
			columns: [t.legacyAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_cards_legacy_account_user_fk",
		}),
		check(
			"finance_app_cards_closing_day_valid",
			sql`${t.closingDay} >= 1 AND ${t.closingDay} <= 31`,
		),
		check(
			"finance_app_cards_due_day_valid",
			sql`${t.dueDay} >= 1 AND ${t.dueDay} <= 31`,
		),
		check(
			"finance_app_cards_limit_cents_positive",
			sql`${t.limitCents} IS NULL OR ${t.limitCents} > 0`,
		),
	],
);

export const cardInvoices = createFinanceTable(
	"card_invoices",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		cardId: integer("card_id").notNull(),
		monthKey: varchar("month_key", { length: 7 }).notNull(),
		closingDate: date("closing_date").notNull(),
		dueDate: date("due_date").notNull(),
		needsReview: boolean("needs_review").notNull().default(false),
		reviewReason: text("review_reason"),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_card_invoices_user_idx").on(t.userId),
		index("finance_app_card_invoices_user_card_idx").on(t.userId, t.cardId),
		index("finance_app_card_invoices_user_due_idx").on(t.userId, t.dueDate),
		unique("finance_app_card_invoices_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_card_invoices_user_card_month_idx").on(
			t.userId,
			t.cardId,
			t.monthKey,
		),
		foreignKey({
			columns: [t.cardId, t.userId],
			foreignColumns: [creditCards.id, creditCards.userId],
			name: "finance_app_card_invoices_card_user_fk",
		}).onDelete("cascade"),
		check(
			"finance_app_card_invoices_month_key_valid",
			sql`${t.monthKey} ~ '^\\d{4}-\\d{2}$'`,
		),
		check(
			"finance_app_card_invoices_dates_order",
			sql`${t.closingDate} <= ${t.dueDate}`,
		),
	],
);

export const cardInstallmentGroups = createFinanceTable(
	"card_installment_groups",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		cardId: integer("card_id").notNull(),
		description: text("description").notNull(),
		totalAmountCents: integer("total_amount_cents").notNull(),
		totalInstallments: integer("total_installments").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(t) => [
		index("finance_app_card_installment_groups_user_idx").on(t.userId),
		index("finance_app_card_installment_groups_user_card_idx").on(
			t.userId,
			t.cardId,
		),
		unique("finance_app_card_installment_groups_id_user_unique").on(
			t.id,
			t.userId,
		),
		foreignKey({
			columns: [t.cardId, t.userId],
			foreignColumns: [creditCards.id, creditCards.userId],
			name: "finance_app_card_installment_groups_card_user_fk",
		}).onDelete("cascade"),
		check(
			"finance_app_card_installment_groups_amount_positive",
			sql`${t.totalAmountCents} > 0`,
		),
		check(
			"finance_app_card_installment_groups_count_positive",
			sql`${t.totalInstallments} > 0`,
		),
	],
);

export const categoryGroups = createFinanceTable(
	"category_groups",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		kind: categoryKind().notNull(),
		cashFlowRole: categoryGroupCashFlowRole("cash_flow_role")
			.notNull()
			.default("operational"),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_category_groups_user_idx").on(t.userId),
		index("finance_app_category_groups_user_kind_idx").on(t.userId, t.kind),
		unique("finance_app_category_groups_id_user_unique").on(t.id, t.userId),
		unique("finance_app_category_groups_id_user_kind_unique").on(
			t.id,
			t.userId,
			t.kind,
		),
		uniqueIndex("finance_app_category_groups_user_kind_name_idx").on(
			t.userId,
			t.kind,
			t.name,
		),
	],
);

export const categories = createFinanceTable(
	"categories",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		groupId: integer("group_id").notNull(),
		name: varchar({ length: 120 }).notNull(),
		kind: categoryKind().notNull(),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_categories_user_idx").on(t.userId),
		index("finance_app_categories_user_group_idx").on(t.userId, t.groupId),
		unique("finance_app_categories_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_categories_user_group_name_idx").on(
			t.userId,
			t.groupId,
			t.name,
		),
		foreignKey({
			columns: [t.groupId, t.userId, t.kind],
			foreignColumns: [
				categoryGroups.id,
				categoryGroups.userId,
				categoryGroups.kind,
			],
			name: "finance_app_categories_group_user_kind_fk",
		}),
	],
);

export const monthlyBudgetTemplates = createFinanceTable(
	"monthly_budget_templates",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scope: monthlyBudgetScope().notNull(),
		categoryGroupId: integer("category_group_id"),
		categoryId: integer("category_id"),
		amountCents: integer("amount_cents").notNull(),
		startsAtMonthKey: varchar("starts_at_month_key", { length: 7 }).notNull(),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_monthly_budget_templates_user_idx").on(t.userId),
		index("finance_app_monthly_budget_templates_user_archived_idx").on(
			t.userId,
			t.isArchived,
		),
		unique("finance_app_monthly_budget_templates_id_user_unique").on(
			t.id,
			t.userId,
		),
		uniqueIndex("finance_app_monthly_budget_templates_unique_scope_idx").on(
			t.userId,
			t.scope,
			t.categoryGroupId,
			t.categoryId,
		),
		foreignKey({
			columns: [t.categoryGroupId, t.userId],
			foreignColumns: [categoryGroups.id, categoryGroups.userId],
			name: "finance_app_monthly_budget_templates_group_user_fk",
		}),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_monthly_budget_templates_category_user_fk",
		}),
		check(
			"finance_app_monthly_budget_templates_month_key_valid",
			sql`${t.startsAtMonthKey} ~ '^\\d{4}-\\d{2}$'`,
		),
		check(
			"finance_app_monthly_budget_templates_amount_positive",
			sql`${t.amountCents} > 0`,
		),
		check(
			"finance_app_monthly_budget_templates_scope_columns_valid",
			sql`(${t.scope} = 'month' AND ${t.categoryGroupId} IS NULL AND ${t.categoryId} IS NULL) OR (${t.scope} = 'category_group' AND ${t.categoryGroupId} IS NOT NULL AND ${t.categoryId} IS NULL) OR (${t.scope} = 'category' AND ${t.categoryGroupId} IS NULL AND ${t.categoryId} IS NOT NULL)`,
		),
	],
);

export const monthlyBudgets = createFinanceTable(
	"monthly_budgets",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		monthKey: varchar("month_key", { length: 7 }).notNull(),
		scope: monthlyBudgetScope().notNull(),
		categoryGroupId: integer("category_group_id"),
		categoryId: integer("category_id"),
		templateId: integer("template_id"),
		amountCents: integer("amount_cents").notNull(),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_monthly_budgets_user_month_idx").on(
			t.userId,
			t.monthKey,
		),
		unique("finance_app_monthly_budgets_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_monthly_budgets_unique_scope_idx").on(
			t.userId,
			t.monthKey,
			t.scope,
			t.categoryGroupId,
			t.categoryId,
		),
		foreignKey({
			columns: [t.categoryGroupId, t.userId],
			foreignColumns: [categoryGroups.id, categoryGroups.userId],
			name: "finance_app_monthly_budgets_group_user_fk",
		}),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_monthly_budgets_category_user_fk",
		}),
		foreignKey({
			columns: [t.templateId, t.userId],
			foreignColumns: [
				monthlyBudgetTemplates.id,
				monthlyBudgetTemplates.userId,
			],
			name: "finance_app_monthly_budgets_template_user_fk",
		}),
		check(
			"finance_app_monthly_budgets_month_key_valid",
			sql`${t.monthKey} ~ '^\\d{4}-\\d{2}$'`,
		),
		check(
			"finance_app_monthly_budgets_amount_positive",
			sql`${t.amountCents} > 0`,
		),
		check(
			"finance_app_monthly_budgets_scope_columns_valid",
			sql`(${t.scope} = 'month' AND ${t.categoryGroupId} IS NULL AND ${t.categoryId} IS NULL) OR (${t.scope} = 'category_group' AND ${t.categoryGroupId} IS NOT NULL AND ${t.categoryId} IS NULL) OR (${t.scope} = 'category' AND ${t.categoryGroupId} IS NULL AND ${t.categoryId} IS NOT NULL)`,
		),
	],
);

export const monthlyBudgetTemplateSkips = createFinanceTable(
	"monthly_budget_template_skips",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		templateId: integer("template_id").notNull(),
		monthKey: varchar("month_key", { length: 7 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(t) => [
		index("finance_app_monthly_budget_template_skips_user_idx").on(t.userId),
		index("finance_app_monthly_budget_template_skips_template_idx").on(
			t.templateId,
		),
		unique("finance_app_monthly_budget_template_skips_id_user_unique").on(
			t.id,
			t.userId,
		),
		uniqueIndex("finance_app_monthly_budget_template_skips_unique_idx").on(
			t.templateId,
			t.monthKey,
		),
		foreignKey({
			columns: [t.templateId, t.userId],
			foreignColumns: [
				monthlyBudgetTemplates.id,
				monthlyBudgetTemplates.userId,
			],
			name: "finance_app_monthly_budget_template_skips_template_user_fk",
		}).onDelete("cascade"),
		check(
			"finance_app_monthly_budget_template_skips_month_key_valid",
			sql`${t.monthKey} ~ '^\\d{4}-\\d{2}$'`,
		),
	],
);

export const importTemplates = createFinanceTable(
	"import_templates",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		sourceLabel: varchar("source_label", { length: 120 }),
		config: jsonb("config").notNull(),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_import_templates_user_idx").on(t.userId),
		index("finance_app_import_templates_user_archived_idx").on(
			t.userId,
			t.isArchived,
		),
		unique("finance_app_import_templates_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_import_templates_user_name_idx").on(
			t.userId,
			t.name,
		),
	],
);

export const importBatches = createFinanceTable(
	"import_batches",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		importTemplateId: integer("import_template_id"),
		accountId: integer("account_id"),
		cardId: integer("card_id"),
		cardInvoiceId: integer("card_invoice_id"),
		status: importBatchStatus().notNull().default("draft"),
		originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
		sourceLabel: varchar("source_label", { length: 120 }),
		rowCount: integer("row_count").notNull().default(0),
		rawFileStored: boolean("raw_file_stored").notNull().default(false),
		suggestionCount: integer("suggestion_count").notNull().default(0),
		suggestionAcceptedCount: integer("suggestion_accepted_count")
			.notNull()
			.default(0),
		suggestionRejectedCount: integer("suggestion_rejected_count")
			.notNull()
			.default(0),
		suggestionOverriddenCount: integer("suggestion_overridden_count")
			.notNull()
			.default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
	},
	(t) => [
		index("finance_app_import_batches_user_idx").on(t.userId),
		index("finance_app_import_batches_user_account_idx").on(
			t.userId,
			t.accountId,
		),
		index("finance_app_import_batches_user_card_idx").on(t.userId, t.cardId),
		index("finance_app_import_batches_user_invoice_idx").on(
			t.userId,
			t.cardInvoiceId,
		),
		index("finance_app_import_batches_user_template_idx").on(
			t.userId,
			t.importTemplateId,
		),
		index("finance_app_import_batches_user_status_idx").on(t.userId, t.status),
		unique("finance_app_import_batches_id_user_unique").on(t.id, t.userId),
		foreignKey({
			columns: [t.importTemplateId, t.userId],
			foreignColumns: [importTemplates.id, importTemplates.userId],
			name: "finance_app_import_batches_template_user_fk",
		}),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_batches_account_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardId, t.userId],
			foreignColumns: [creditCards.id, creditCards.userId],
			name: "finance_app_import_batches_card_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardInvoiceId, t.userId],
			foreignColumns: [cardInvoices.id, cardInvoices.userId],
			name: "finance_app_import_batches_invoice_user_fk",
		}).onDelete("cascade"),
		check(
			"finance_app_import_batches_account_or_card_valid",
			sql`(${t.accountId} IS NOT NULL AND ${t.cardId} IS NULL AND ${t.cardInvoiceId} IS NULL) OR (${t.accountId} IS NULL AND ${t.cardId} IS NOT NULL AND ${t.cardInvoiceId} IS NOT NULL)`,
		),
	],
);

export const importRows = createFinanceTable(
	"import_rows",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		batchId: integer("batch_id").notNull(),
		accountId: integer("account_id"),
		cardId: integer("card_id"),
		cardInvoiceId: integer("card_invoice_id"),
		rowNumber: integer("row_number").notNull(),
		status: importRowStatus().notNull().default("pending_review"),
		occurredOn: date("occurred_on"),
		amountCents: integer("amount_cents"),
		movementType: movementType("movement_type"),
		originalDescription: text("original_description"),
		normalizedDescription: text("normalized_description"),
		externalId: varchar("external_id", { length: 255 }),
		bankCategory: varchar("bank_category", { length: 120 }),
		suggestedCategoryId: integer("suggested_category_id"),
		suggestedSourceAccountId: integer("suggested_source_account_id"),
		suggestedDestinationAccountId: integer("suggested_destination_account_id"),
		suggestedRuleId: integer("suggested_rule_id"),
		suggestedDescription: text("suggested_description"),
		suggestedRecurrenceId: integer("suggested_recurrence_id"),
		suggestedRecurrenceOccurrenceOn: date("suggested_recurrence_occurrence_on"),
		suggestionSource: varchar("suggestion_source", { length: 40 }),
		validationError: text("validation_error"),
		parsedData: jsonb("parsed_data"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(t) => [
		index("finance_app_import_rows_user_idx").on(t.userId),
		index("finance_app_import_rows_user_batch_idx").on(t.userId, t.batchId),
		index("finance_app_import_rows_user_status_idx").on(t.userId, t.status),
		index("finance_app_import_rows_user_card_idx").on(t.userId, t.cardId),
		index("finance_app_import_rows_user_invoice_idx").on(
			t.userId,
			t.cardInvoiceId,
		),
		unique("finance_app_import_rows_id_user_unique").on(t.id, t.userId),
		uniqueIndex("finance_app_import_rows_batch_row_idx").on(
			t.batchId,
			t.rowNumber,
		),
		foreignKey({
			columns: [t.batchId, t.userId],
			foreignColumns: [importBatches.id, importBatches.userId],
			name: "finance_app_import_rows_batch_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_rows_account_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardId, t.userId],
			foreignColumns: [creditCards.id, creditCards.userId],
			name: "finance_app_import_rows_card_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardInvoiceId, t.userId],
			foreignColumns: [cardInvoices.id, cardInvoices.userId],
			name: "finance_app_import_rows_invoice_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.suggestedCategoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_import_rows_suggested_category_user_fk",
		}),
		foreignKey({
			columns: [t.suggestedSourceAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_rows_suggested_source_account_user_fk",
		}),
		foreignKey({
			columns: [t.suggestedDestinationAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_rows_suggested_destination_account_user_fk",
		}),
		foreignKey({
			columns: [t.suggestedRecurrenceId, t.userId],
			foreignColumns: [recurrences.id, recurrences.userId],
			name: "finance_app_import_rows_suggested_recurrence_user_fk",
		}),
		check(
			"finance_app_import_rows_amount_cents_positive",
			sql`${t.amountCents} IS NULL OR ${t.amountCents} > 0`,
		),
		check(
			"finance_app_import_rows_suggested_recurrence_columns_valid",
			sql`(${t.suggestedRecurrenceId} IS NULL) = (${t.suggestedRecurrenceOccurrenceOn} IS NULL)`,
		),
		check(
			"finance_app_import_rows_account_or_card_valid",
			sql`(${t.accountId} IS NOT NULL AND ${t.cardId} IS NULL AND ${t.cardInvoiceId} IS NULL) OR (${t.accountId} IS NULL AND ${t.cardId} IS NOT NULL AND ${t.cardInvoiceId} IS NOT NULL)`,
		),
	],
);

export const importCategoryRules = createFinanceTable(
	"import_category_rules",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		action: importRuleAction("action").notNull().default("categorize"),
		categoryId: integer("category_id"),
		accountId: integer("account_id"),
		sourceAccountId: integer("source_account_id"),
		destinationAccountId: integer("destination_account_id"),
		movementType: movementType("movement_type"),
		normalizedDescription: text("normalized_description").notNull(),
		textMatchMode: importRuleTextMatchMode("text_match_mode")
			.notNull()
			.default("contains"),
		amountCents: integer("amount_cents"),
		amountToleranceCents: integer("amount_tolerance_cents"),
		descriptionOverride: text("description_override"),
		priority: integer("priority").notNull().default(0),
		matchCount: integer("match_count").notNull().default(0),
		acceptedCount: integer("accepted_count").notNull().default(0),
		rejectedCount: integer("rejected_count").notNull().default(0),
		overriddenCount: integer("overridden_count").notNull().default(0),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_import_category_rules_user_idx").on(t.userId),
		index("finance_app_import_category_rules_user_archived_idx").on(
			t.userId,
			t.isArchived,
		),
		unique("finance_app_import_category_rules_id_user_unique").on(
			t.id,
			t.userId,
		),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_import_category_rules_category_user_fk",
		}),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_category_rules_account_user_fk",
		}),
		foreignKey({
			columns: [t.sourceAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_category_rules_source_account_user_fk",
		}),
		foreignKey({
			columns: [t.destinationAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_import_category_rules_destination_account_user_fk",
		}),
		check(
			"finance_app_import_category_rules_type_valid",
			sql`${t.movementType} IS NULL OR ${t.movementType} IN ('income', 'expense', 'transfer')`,
		),
		check(
			"finance_app_import_category_rules_action_fields_valid",
			sql`(${t.action} = 'categorize' AND ${t.categoryId} IS NOT NULL AND ${t.sourceAccountId} IS NULL AND ${t.destinationAccountId} IS NULL AND ${t.movementType} IN ('income', 'expense')) OR (${t.action} = 'ignore' AND ${t.categoryId} IS NULL AND ${t.sourceAccountId} IS NULL AND ${t.destinationAccountId} IS NULL) OR (${t.action} = 'transfer' AND ${t.categoryId} IS NULL AND ${t.sourceAccountId} IS NOT NULL AND ${t.destinationAccountId} IS NOT NULL AND ${t.sourceAccountId} <> ${t.destinationAccountId} AND ${t.movementType} IN ('income', 'expense'))`,
		),
		check(
			"finance_app_import_category_rules_amount_cents_positive",
			sql`${t.amountCents} IS NULL OR ${t.amountCents} > 0`,
		),
		check(
			"finance_app_import_category_rules_amount_tolerance_non_negative",
			sql`${t.amountToleranceCents} IS NULL OR ${t.amountToleranceCents} >= 0`,
		),
	],
);

export const recurrences = createFinanceTable(
	"recurrences",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		description: text("description"),
		movementType: movementType("movement_type").notNull(),
		accountId: integer("account_id").notNull(),
		categoryId: integer("category_id"),
		amountCents: integer("amount_cents").notNull(),
		currency: varchar({ length: 3 }).notNull().default("BRL"),
		frequency: recurrenceFrequency().notNull(),
		intervalCount: integer("interval_count").notNull().default(1),
		anchorDay: integer("anchor_day"),
		anchorWeekday: integer("anchor_weekday"),
		startsOn: date("starts_on").notNull(),
		endsOn: date("ends_on"),
		isSubscription: boolean("is_subscription").notNull().default(false),
		isBill: boolean("is_bill").notNull().default(false),
		isArchived: boolean("is_archived").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_recurrences_user_idx").on(t.userId),
		index("finance_app_recurrences_user_archived_idx").on(
			t.userId,
			t.isArchived,
		),
		index("finance_app_recurrences_user_frequency_idx").on(
			t.userId,
			t.frequency,
		),
		unique("finance_app_recurrences_id_user_unique").on(t.id, t.userId),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_recurrences_account_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_recurrences_category_user_fk",
		}),
		check(
			"finance_app_recurrences_type_valid",
			sql`${t.movementType} IN ('income', 'expense')`,
		),
		check(
			"finance_app_recurrences_amount_cents_positive",
			sql`${t.amountCents} > 0`,
		),
		check(
			"finance_app_recurrences_interval_count_positive",
			sql`${t.intervalCount} >= 1`,
		),
		check(
			"finance_app_recurrences_anchor_day_valid",
			sql`${t.anchorDay} IS NULL OR (${t.anchorDay} >= 1 AND ${t.anchorDay} <= 31)`,
		),
		check(
			"finance_app_recurrences_anchor_weekday_valid",
			sql`${t.anchorWeekday} IS NULL OR (${t.anchorWeekday} >= 0 AND ${t.anchorWeekday} <= 6)`,
		),
		check(
			"finance_app_recurrences_ends_on_valid",
			sql`${t.endsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`,
		),
		check(
			"finance_app_recurrences_category_required_for_non_bill",
			sql`${t.isBill} = true OR ${t.categoryId} IS NOT NULL`,
		),
		check(
			"finance_app_recurrences_once_ends_on_valid",
			sql`${t.frequency} <> 'once' OR ${t.endsOn} IS NULL OR ${t.endsOn} = ${t.startsOn}`,
		),
	],
);

export const transactionSavedFilters = createFinanceTable(
	"transaction_saved_filters",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: varchar({ length: 120 }).notNull(),
		start: date("start_on").notNull(),
		end: date("end_on").notNull(),
		accountId: integer("account_id"),
		categoryId: integer("category_id"),
		movementType: movementType("movement_type"),
		query: text("query"),
		sort: transactionSavedFilterSort().notNull().default("date"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_transaction_saved_filters_user_idx").on(t.userId),
		unique("finance_app_transaction_saved_filters_id_user_unique").on(
			t.id,
			t.userId,
		),
		uniqueIndex("finance_app_transaction_saved_filters_user_name_idx").on(
			t.userId,
			t.name,
		),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_transaction_saved_filters_account_user_fk",
		}),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_transaction_saved_filters_category_user_fk",
		}),
		check(
			"finance_app_transaction_saved_filters_period_valid",
			sql`${t.end} >= ${t.start}`,
		),
	],
);

export const transactions = createFinanceTable(
	"transactions",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountId: integer("account_id"),
		destinationAccountId: integer("destination_account_id"),
		cardId: integer("card_id"),
		cardInvoiceId: integer("card_invoice_id"),
		cardEntryKind: cardEntryKind("card_entry_kind"),
		cardInstallmentGroupId: integer("card_installment_group_id"),
		installmentNumber: integer("installment_number"),
		installmentCount: integer("installment_count"),
		categoryId: integer("category_id"),
		categoryRuleId: integer("category_rule_id"),
		importBatchId: integer("import_batch_id"),
		importRowId: integer("import_row_id"),
		recurrenceId: integer("recurrence_id"),
		recurrenceOccurrenceOn: date("recurrence_occurrence_on"),
		movementType: movementType("movement_type").notNull(),
		status: transactionStatus().notNull().default("confirmed"),
		amountCents: integer("amount_cents").notNull(),
		isArchived: boolean("is_archived").notNull().default(false),
		currency: varchar({ length: 3 }).notNull().default("BRL"),
		occurredOn: date("occurred_on").notNull(),
		originalDescription: text("original_description"),
		description: text("description").notNull(),
		notes: text("notes"),
		externalId: varchar("external_id", { length: 255 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_transactions_user_idx").on(t.userId),
		index("finance_app_transactions_user_account_date_idx").on(
			t.userId,
			t.accountId,
			t.occurredOn,
		),
		index("finance_app_transactions_user_card_date_idx").on(
			t.userId,
			t.cardId,
			t.occurredOn,
		),
		index("finance_app_transactions_user_invoice_idx").on(
			t.userId,
			t.cardInvoiceId,
		),
		index("finance_app_transactions_user_category_idx").on(
			t.userId,
			t.categoryId,
		),
		index("finance_app_transactions_user_category_rule_idx").on(
			t.userId,
			t.categoryRuleId,
		),
		index("finance_app_transactions_user_type_date_idx").on(
			t.userId,
			t.movementType,
			t.occurredOn,
		),
		index("finance_app_transactions_user_archived_idx").on(
			t.userId,
			t.isArchived,
		),
		index("finance_app_transactions_user_import_idx").on(
			t.userId,
			t.importBatchId,
		),
		uniqueIndex("finance_app_transactions_recurrence_occurrence_idx")
			.on(t.recurrenceId, t.recurrenceOccurrenceOn)
			.where(sql`${t.recurrenceId} IS NOT NULL`),
		foreignKey({
			columns: [t.accountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_transactions_account_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.destinationAccountId, t.userId],
			foreignColumns: [financialAccounts.id, financialAccounts.userId],
			name: "finance_app_transactions_destination_account_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardId, t.userId],
			foreignColumns: [creditCards.id, creditCards.userId],
			name: "finance_app_transactions_card_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardInvoiceId, t.userId],
			foreignColumns: [cardInvoices.id, cardInvoices.userId],
			name: "finance_app_transactions_invoice_user_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [t.cardInstallmentGroupId, t.userId],
			foreignColumns: [cardInstallmentGroups.id, cardInstallmentGroups.userId],
			name: "finance_app_transactions_installment_group_user_fk",
		}),
		foreignKey({
			columns: [t.categoryId, t.userId],
			foreignColumns: [categories.id, categories.userId],
			name: "finance_app_transactions_category_user_fk",
		}),
		foreignKey({
			columns: [t.categoryRuleId, t.userId],
			foreignColumns: [importCategoryRules.id, importCategoryRules.userId],
			name: "finance_app_transactions_category_rule_user_fk",
		}),
		foreignKey({
			columns: [t.importBatchId, t.userId],
			foreignColumns: [importBatches.id, importBatches.userId],
			name: "finance_app_transactions_import_batch_user_fk",
		}),
		foreignKey({
			columns: [t.importRowId, t.userId],
			foreignColumns: [importRows.id, importRows.userId],
			name: "finance_app_transactions_import_row_user_fk",
		}),
		foreignKey({
			columns: [t.recurrenceId, t.userId],
			foreignColumns: [recurrences.id, recurrences.userId],
			name: "finance_app_transactions_recurrence_user_fk",
		}),
		check(
			"finance_app_transactions_amount_cents_positive",
			sql`${t.amountCents} > 0`,
		),
		check(
			"finance_app_transactions_recurrence_columns_valid",
			sql`(${t.recurrenceId} IS NULL) = (${t.recurrenceOccurrenceOn} IS NULL)`,
		),
		check(
			"finance_app_transactions_installment_columns_valid",
			sql`(${t.cardInstallmentGroupId} IS NULL AND ${t.installmentNumber} IS NULL AND ${t.installmentCount} IS NULL) OR (${t.cardInstallmentGroupId} IS NOT NULL AND ${t.installmentNumber} IS NOT NULL AND ${t.installmentCount} IS NOT NULL AND ${t.installmentNumber} > 0 AND ${t.installmentCount} > 0 AND ${t.installmentNumber} <= ${t.installmentCount})`,
		),
		check(
			"finance_app_transactions_account_card_shape_valid",
			sql`(${t.movementType} = 'expense' AND ${t.cardId} IS NOT NULL AND ${t.cardInvoiceId} IS NOT NULL AND ${t.cardEntryKind} IS NOT NULL AND ${t.accountId} IS NULL AND ${t.destinationAccountId} IS NULL) OR (${t.movementType} = 'credit_card_payment' AND ${t.accountId} IS NOT NULL AND ${t.cardId} IS NOT NULL AND ${t.cardInvoiceId} IS NOT NULL AND ${t.cardEntryKind} IS NULL AND ${t.destinationAccountId} IS NULL AND ${t.categoryId} IS NULL) OR (${t.cardId} IS NULL AND ${t.cardInvoiceId} IS NULL AND ${t.cardEntryKind} IS NULL AND ${t.accountId} IS NOT NULL)`,
		),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	authAccounts: many(account),
	sessions: many(session),
	financialAccounts: many(financialAccounts),
	creditCards: many(creditCards),
	cardInvoices: many(cardInvoices),
	cardInstallmentGroups: many(cardInstallmentGroups),
	categoryGroups: many(categoryGroups),
	categories: many(categories),
	monthlyBudgetTemplates: many(monthlyBudgetTemplates),
	monthlyBudgetTemplateSkips: many(monthlyBudgetTemplateSkips),
	monthlyBudgets: many(monthlyBudgets),
	transactions: many(transactions),
	transactionSavedFilters: many(transactionSavedFilters),
	recurrences: many(recurrences),
	importTemplates: many(importTemplates),
	importBatches: many(importBatches),
	importRows: many(importRows),
	importCategoryRules: many(importCategoryRules),
	assistantSuggestions: many(assistantSuggestions),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const financialAccountRelations = relations(
	financialAccounts,
	({ many, one }) => ({
		user: one(user, {
			fields: [financialAccounts.userId],
			references: [user.id],
		}),
		transactions: many(transactions, { relationName: "sourceAccount" }),
		destinationTransactions: many(transactions, {
			relationName: "destinationAccount",
		}),
		importBatches: many(importBatches),
		importRows: many(importRows, { relationName: "importRowAccount" }),
		suggestedSourceImportRows: many(importRows, {
			relationName: "importRowSuggestedSourceAccount",
		}),
		suggestedDestinationImportRows: many(importRows, {
			relationName: "importRowSuggestedDestinationAccount",
		}),
		importCategoryRules: many(importCategoryRules, {
			relationName: "importCategoryRuleAccount",
		}),
		sourceImportCategoryRules: many(importCategoryRules, {
			relationName: "importCategoryRuleSourceAccount",
		}),
		destinationImportCategoryRules: many(importCategoryRules, {
			relationName: "importCategoryRuleDestinationAccount",
		}),
		transactionSavedFilters: many(transactionSavedFilters),
		recurrences: many(recurrences),
	}),
);

export const creditCardRelations = relations(creditCards, ({ many, one }) => ({
	user: one(user, { fields: [creditCards.userId], references: [user.id] }),
	defaultPaymentAccount: one(financialAccounts, {
		fields: [creditCards.defaultPaymentAccountId],
		references: [financialAccounts.id],
	}),
	legacyAccount: one(financialAccounts, {
		fields: [creditCards.legacyAccountId],
		references: [financialAccounts.id],
	}),
	invoices: many(cardInvoices),
	installmentGroups: many(cardInstallmentGroups),
	transactions: many(transactions),
	importBatches: many(importBatches),
	importRows: many(importRows),
}));

export const cardInvoiceRelations = relations(
	cardInvoices,
	({ many, one }) => ({
		user: one(user, { fields: [cardInvoices.userId], references: [user.id] }),
		card: one(creditCards, {
			fields: [cardInvoices.cardId],
			references: [creditCards.id],
		}),
		transactions: many(transactions),
		importBatches: many(importBatches),
		importRows: many(importRows),
	}),
);

export const cardInstallmentGroupRelations = relations(
	cardInstallmentGroups,
	({ many, one }) => ({
		user: one(user, {
			fields: [cardInstallmentGroups.userId],
			references: [user.id],
		}),
		card: one(creditCards, {
			fields: [cardInstallmentGroups.cardId],
			references: [creditCards.id],
		}),
		transactions: many(transactions),
	}),
);

export const categoryGroupRelations = relations(
	categoryGroups,
	({ many, one }) => ({
		user: one(user, { fields: [categoryGroups.userId], references: [user.id] }),
		categories: many(categories),
		monthlyBudgetTemplates: many(monthlyBudgetTemplates),
		monthlyBudgets: many(monthlyBudgets),
	}),
);

export const categoryRelations = relations(categories, ({ many, one }) => ({
	user: one(user, { fields: [categories.userId], references: [user.id] }),
	group: one(categoryGroups, {
		fields: [categories.groupId],
		references: [categoryGroups.id],
	}),
	transactions: many(transactions),
	recurrences: many(recurrences),
	importCategoryRules: many(importCategoryRules),
	monthlyBudgetTemplates: many(monthlyBudgetTemplates),
	monthlyBudgets: many(monthlyBudgets),
	transactionSavedFilters: many(transactionSavedFilters),
}));

export const transactionSavedFilterRelations = relations(
	transactionSavedFilters,
	({ one }) => ({
		user: one(user, {
			fields: [transactionSavedFilters.userId],
			references: [user.id],
		}),
		account: one(financialAccounts, {
			fields: [transactionSavedFilters.accountId],
			references: [financialAccounts.id],
		}),
		category: one(categories, {
			fields: [transactionSavedFilters.categoryId],
			references: [categories.id],
		}),
	}),
);

export const monthlyBudgetRelations = relations(monthlyBudgets, ({ one }) => ({
	user: one(user, { fields: [monthlyBudgets.userId], references: [user.id] }),
	categoryGroup: one(categoryGroups, {
		fields: [monthlyBudgets.categoryGroupId],
		references: [categoryGroups.id],
	}),
	category: one(categories, {
		fields: [monthlyBudgets.categoryId],
		references: [categories.id],
	}),
	template: one(monthlyBudgetTemplates, {
		fields: [monthlyBudgets.templateId],
		references: [monthlyBudgetTemplates.id],
	}),
}));

export const monthlyBudgetTemplateRelations = relations(
	monthlyBudgetTemplates,
	({ many, one }) => ({
		user: one(user, {
			fields: [monthlyBudgetTemplates.userId],
			references: [user.id],
		}),
		categoryGroup: one(categoryGroups, {
			fields: [monthlyBudgetTemplates.categoryGroupId],
			references: [categoryGroups.id],
		}),
		category: one(categories, {
			fields: [monthlyBudgetTemplates.categoryId],
			references: [categories.id],
		}),
		monthlyBudgets: many(monthlyBudgets),
		skips: many(monthlyBudgetTemplateSkips),
	}),
);

export const monthlyBudgetTemplateSkipRelations = relations(
	monthlyBudgetTemplateSkips,
	({ one }) => ({
		user: one(user, {
			fields: [monthlyBudgetTemplateSkips.userId],
			references: [user.id],
		}),
		template: one(monthlyBudgetTemplates, {
			fields: [monthlyBudgetTemplateSkips.templateId],
			references: [monthlyBudgetTemplates.id],
		}),
	}),
);

export const importTemplateRelations = relations(
	importTemplates,
	({ many, one }) => ({
		user: one(user, {
			fields: [importTemplates.userId],
			references: [user.id],
		}),
		batches: many(importBatches),
	}),
);

export const importBatchRelations = relations(
	importBatches,
	({ many, one }) => ({
		user: one(user, { fields: [importBatches.userId], references: [user.id] }),
		importTemplate: one(importTemplates, {
			fields: [importBatches.importTemplateId],
			references: [importTemplates.id],
		}),
		account: one(financialAccounts, {
			fields: [importBatches.accountId],
			references: [financialAccounts.id],
		}),
		card: one(creditCards, {
			fields: [importBatches.cardId],
			references: [creditCards.id],
		}),
		cardInvoice: one(cardInvoices, {
			fields: [importBatches.cardInvoiceId],
			references: [cardInvoices.id],
		}),
		rows: many(importRows),
		transactions: many(transactions),
	}),
);

export const importRowRelations = relations(importRows, ({ one }) => ({
	user: one(user, { fields: [importRows.userId], references: [user.id] }),
	batch: one(importBatches, {
		fields: [importRows.batchId],
		references: [importBatches.id],
	}),
	account: one(financialAccounts, {
		fields: [importRows.accountId],
		references: [financialAccounts.id],
		relationName: "importRowAccount",
	}),
	card: one(creditCards, {
		fields: [importRows.cardId],
		references: [creditCards.id],
	}),
	cardInvoice: one(cardInvoices, {
		fields: [importRows.cardInvoiceId],
		references: [cardInvoices.id],
	}),
	suggestedCategory: one(categories, {
		fields: [importRows.suggestedCategoryId],
		references: [categories.id],
	}),
	suggestedSourceAccount: one(financialAccounts, {
		fields: [importRows.suggestedSourceAccountId],
		references: [financialAccounts.id],
		relationName: "importRowSuggestedSourceAccount",
	}),
	suggestedDestinationAccount: one(financialAccounts, {
		fields: [importRows.suggestedDestinationAccountId],
		references: [financialAccounts.id],
		relationName: "importRowSuggestedDestinationAccount",
	}),
	suggestedRule: one(importCategoryRules, {
		fields: [importRows.suggestedRuleId],
		references: [importCategoryRules.id],
	}),
	suggestedRecurrence: one(recurrences, {
		fields: [importRows.suggestedRecurrenceId],
		references: [recurrences.id],
	}),
}));

export const recurrenceRelations = relations(recurrences, ({ many, one }) => ({
	user: one(user, { fields: [recurrences.userId], references: [user.id] }),
	account: one(financialAccounts, {
		fields: [recurrences.accountId],
		references: [financialAccounts.id],
	}),
	category: one(categories, {
		fields: [recurrences.categoryId],
		references: [categories.id],
	}),
	transactions: many(transactions),
	suggestedImportRows: many(importRows),
}));

export const importCategoryRuleRelations = relations(
	importCategoryRules,
	({ one }) => ({
		user: one(user, {
			fields: [importCategoryRules.userId],
			references: [user.id],
		}),
		category: one(categories, {
			fields: [importCategoryRules.categoryId],
			references: [categories.id],
		}),
		account: one(financialAccounts, {
			fields: [importCategoryRules.accountId],
			references: [financialAccounts.id],
			relationName: "importCategoryRuleAccount",
		}),
		sourceAccount: one(financialAccounts, {
			fields: [importCategoryRules.sourceAccountId],
			references: [financialAccounts.id],
			relationName: "importCategoryRuleSourceAccount",
		}),
		destinationAccount: one(financialAccounts, {
			fields: [importCategoryRules.destinationAccountId],
			references: [financialAccounts.id],
			relationName: "importCategoryRuleDestinationAccount",
		}),
	}),
);

export const assistantSuggestions = createFinanceTable(
	"assistant_suggestions",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: assistantSuggestionKind().notNull(),
		fingerprint: varchar({ length: 200 }).notNull(),
		payload: jsonb().notNull(),
		reason: text().notNull(),
		status: assistantSuggestionStatus().notNull().default("pending"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
			() => new Date(),
		),
	},
	(t) => [
		index("finance_app_assistant_suggestions_user_status_kind_idx").on(
			t.userId,
			t.status,
			t.kind,
		),
		uniqueIndex("finance_app_assistant_suggestions_pending_unique_idx")
			.on(t.userId, t.kind, t.fingerprint)
			.where(sql`${t.status} = 'pending'`),
	],
);

export const assistantSuggestionRelations = relations(
	assistantSuggestions,
	({ one }) => ({
		user: one(user, {
			fields: [assistantSuggestions.userId],
			references: [user.id],
		}),
	}),
);

export const auditEvents = createFinanceTable(
	"audit_events",
	{
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		entityType: auditEntityType("entity_type").notNull(),
		entityId: integer("entity_id"),
		action: auditAction().notNull(),
		summary: varchar({ length: 240 }).notNull(),
		diff: jsonb(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(t) => [
		index("finance_app_audit_events_user_created_idx").on(
			t.userId,
			t.createdAt.desc(),
		),
		index("finance_app_audit_events_user_entity_idx").on(
			t.userId,
			t.entityType,
			t.entityId,
		),
	],
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
	user: one(user, { fields: [auditEvents.userId], references: [user.id] }),
}));

export const transactionRelations = relations(transactions, ({ one }) => ({
	user: one(user, { fields: [transactions.userId], references: [user.id] }),
	account: one(financialAccounts, {
		fields: [transactions.accountId],
		references: [financialAccounts.id],
		relationName: "sourceAccount",
	}),
	destinationAccount: one(financialAccounts, {
		fields: [transactions.destinationAccountId],
		references: [financialAccounts.id],
		relationName: "destinationAccount",
	}),
	card: one(creditCards, {
		fields: [transactions.cardId],
		references: [creditCards.id],
	}),
	cardInvoice: one(cardInvoices, {
		fields: [transactions.cardInvoiceId],
		references: [cardInvoices.id],
	}),
	cardInstallmentGroup: one(cardInstallmentGroups, {
		fields: [transactions.cardInstallmentGroupId],
		references: [cardInstallmentGroups.id],
	}),
	category: one(categories, {
		fields: [transactions.categoryId],
		references: [categories.id],
	}),
	categoryRule: one(importCategoryRules, {
		fields: [transactions.categoryRuleId],
		references: [importCategoryRules.id],
	}),
	importBatch: one(importBatches, {
		fields: [transactions.importBatchId],
		references: [importBatches.id],
	}),
	importRow: one(importRows, {
		fields: [transactions.importRowId],
		references: [importRows.id],
	}),
	recurrence: one(recurrences, {
		fields: [transactions.recurrenceId],
		references: [recurrences.id],
	}),
}));
