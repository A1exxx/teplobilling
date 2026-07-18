CREATE TYPE "public"."account_customer_role" AS ENUM('owner', 'payer');--> statement-breakpoint
CREATE TYPE "public"."consumer_category" AS ENUM('population', 'other');--> statement-breakpoint
CREATE TYPE "public"."customer_kind" AS ENUM('person', 'legal');--> statement-breakpoint
CREATE TYPE "public"."meter_kind" AS ENUM('ipu_hw', 'ipu_heating', 'odpu_heat', 'legal_unit');--> statement-breakpoint
CREATE TYPE "public"."meter_status" AS ENUM('active', 'verification_expired', 'broken', 'removed');--> statement-breakpoint
CREATE TYPE "public"."norm_kind" AS ENUM('heating_gcal_m2', 'hw_m3_person', 'hw_heat_gcal_m3');--> statement-breakpoint
CREATE TYPE "public"."reading_source" AS ENUM('operator', 'import', 'subscriber', 'gis', 'estimate_avg', 'estimate_norm');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('accepted', 'quarantine', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."service_code" AS ENUM('heating', 'hot_water');--> statement-breakpoint
CREATE TYPE "public"."tariff_component" AS ENUM('single', 'hw_cold_water', 'hw_heat_energy');--> statement-breakpoint
CREATE TYPE "public"."vat_mode" AS ENUM('included', 'on_top', 'none');--> statement-breakpoint
CREATE TABLE "account_customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"role" "account_customer_role" DEFAULT 'owner' NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date
);
--> statement-breakpoint
CREATE TABLE "account_resident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "customer_kind" DEFAULT 'person' NOT NULL,
	"last_name" text,
	"first_name" text,
	"middle_name" text,
	"full_name" text,
	"inn" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "meter_kind" NOT NULL,
	"premise_id" uuid,
	"building_id" uuid,
	"serial_no" text NOT NULL,
	"digits" integer DEFAULT 5 NOT NULL,
	"install_date" date,
	"verification_interval_months" integer,
	"next_verification_date" date,
	"status" "meter_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meter_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"value" numeric(14, 6),
	"consumption" numeric(14, 6),
	"reading_date" date,
	"source" "reading_source" DEFAULT 'operator' NOT NULL,
	"status" "reading_status" DEFAULT 'accepted' NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipality" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"oktmo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "norm_kind" NOT NULL,
	"municipality_id" uuid,
	"category_code" text,
	"value" numeric(14, 6) NOT NULL,
	"doc_ref" text,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "tariff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service" "service_code" NOT NULL,
	"consumer_category" "consumer_category" DEFAULT 'population' NOT NULL,
	"component" "tariff_component" DEFAULT 'single' NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"vat_mode" "vat_mode" DEFAULT 'included' NOT NULL,
	"doc_ref" text,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
ALTER TABLE "building" ADD COLUMN "category_code" text;--> statement-breakpoint
ALTER TABLE "settlement" ADD COLUMN "municipality_id" uuid;--> statement-breakpoint
ALTER TABLE "account_customer" ADD CONSTRAINT "account_customer_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_customer" ADD CONSTRAINT "account_customer_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_customer" ADD CONSTRAINT "account_customer_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_resident" ADD CONSTRAINT "account_resident_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_resident" ADD CONSTRAINT "account_resident_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter" ADD CONSTRAINT "meter_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter" ADD CONSTRAINT "meter_premise_id_premise_id_fk" FOREIGN KEY ("premise_id") REFERENCES "public"."premise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter" ADD CONSTRAINT "meter_building_id_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_meter_id_meter_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_period_id_billing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."billing_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipality" ADD CONSTRAINT "municipality_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm" ADD CONSTRAINT "norm_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm" ADD CONSTRAINT "norm_municipality_id_municipality_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meter_reading_accepted_per_period" ON "meter_reading" USING btree ("meter_id","period_id") WHERE status = 'accepted';--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_municipality_id_municipality_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipality"("id") ON DELETE no action ON UPDATE no action;