ALTER TABLE "finance_app_import_batches" DROP CONSTRAINT "finance_app_import_batches_account_user_fk";
--> statement-breakpoint
ALTER TABLE "finance_app_import_rows" DROP CONSTRAINT "finance_app_import_rows_account_user_fk";
--> statement-breakpoint
ALTER TABLE "finance_app_recurrences" DROP CONSTRAINT "finance_app_recurrences_account_user_fk";
--> statement-breakpoint
ALTER TABLE "finance_app_transactions" DROP CONSTRAINT "finance_app_transactions_account_user_fk";
--> statement-breakpoint
ALTER TABLE "finance_app_transactions" DROP CONSTRAINT "finance_app_transactions_destination_account_user_fk";
--> statement-breakpoint
ALTER TABLE "finance_app_import_batches" ADD CONSTRAINT "finance_app_import_batches_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."finance_app_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_app_import_rows" ADD CONSTRAINT "finance_app_import_rows_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."finance_app_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_app_recurrences" ADD CONSTRAINT "finance_app_recurrences_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."finance_app_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_app_transactions" ADD CONSTRAINT "finance_app_transactions_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."finance_app_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_app_transactions" ADD CONSTRAINT "finance_app_transactions_destination_account_user_fk" FOREIGN KEY ("destination_account_id","user_id") REFERENCES "public"."finance_app_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;