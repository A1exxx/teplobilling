CREATE TYPE "public"."accrual_line_kind" AS ENUM('accrual', 'uplift', 'vat');--> statement-breakpoint
CREATE TYPE "public"."calc_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "accrual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"calc_run_id" uuid NOT NULL,
	"doc_type" text DEFAULT 'regular' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accrual_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"accrual_id" uuid NOT NULL,
	"service" "service_code" NOT NULL,
	"component" "tariff_component" NOT NULL,
	"method" text NOT NULL,
	"line_kind" "accrual_line_kind" DEFAULT 'accrual' NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"volume" numeric(14, 6) NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(12, 4) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"trace" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calc_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"status" "calc_run_status" DEFAULT 'running' NOT NULL,
	"accounts_total" integer DEFAULT 0 NOT NULL,
	"accounts_calculated" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine_version" text DEFAULT 'v1' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_period_id_billing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual" ADD CONSTRAINT "accrual_calc_run_id_calc_run_id_fk" FOREIGN KEY ("calc_run_id") REFERENCES "public"."calc_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_line" ADD CONSTRAINT "accrual_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accrual_line" ADD CONSTRAINT "accrual_line_accrual_id_accrual_id_fk" FOREIGN KEY ("accrual_id") REFERENCES "public"."accrual"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calc_run" ADD CONSTRAINT "calc_run_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calc_run" ADD CONSTRAINT "calc_run_period_id_billing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accrual_current_per_period" ON "accrual" USING btree ("account_id","period_id","doc_type") WHERE is_current;