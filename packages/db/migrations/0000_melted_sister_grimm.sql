CREATE TYPE "public"."account_kind" AS ENUM('residential', 'legal');--> statement-breakpoint
CREATE TYPE "public"."building_kind" AS ENUM('mkd', 'private', 'non_residential');--> statement-breakpoint
CREATE TYPE "public"."heating_payment_mode" AS ENUM('during_season', 'uniform_year');--> statement-breakpoint
CREATE TYPE "public"."hw_system" AS ENUM('central_closed', 'central_open', 'none');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'calculating', 'calculated', 'approved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."premise_kind" AS ENUM('flat', 'room', 'non_residential');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"premise_id" uuid,
	"date_open" date NOT NULL,
	"date_close" date,
	"ownership_share" numeric(5, 4) DEFAULT '1' NOT NULL,
	"gis_els" text,
	"gis_zhku_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "building" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"street_id" uuid NOT NULL,
	"number" text NOT NULL,
	"building_kind" "building_kind" DEFAULT 'mkd' NOT NULL,
	"gar_house_guid" text,
	"cadastral_no" text,
	"total_premises_area" numeric(12, 2),
	"residential_area" numeric(12, 2),
	"non_residential_area" numeric(12, 2),
	"common_area" numeric(12, 2),
	"floors" integer,
	"build_year" integer,
	"hw_system" "hw_system" DEFAULT 'central_closed' NOT NULL,
	"heating_payment_mode" "heating_payment_mode" DEFAULT 'during_season' NOT NULL,
	"address_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"number" text NOT NULL,
	"premise_kind" "premise_kind" DEFAULT 'flat' NOT NULL,
	"total_area" numeric(10, 2),
	"living_area" numeric(10, 2),
	"floor" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"oktmo" text,
	"gar_guid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "street" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gar_guid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"inn" text,
	"kpp" text,
	"ogrn" text,
	"legal_address" text,
	"bank_name" text,
	"bic" text,
	"corr_account" text,
	"settlement_account" text,
	"director" text,
	"phone" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_premise_id_premise_id_fk" FOREIGN KEY ("premise_id") REFERENCES "public"."premise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period" ADD CONSTRAINT "billing_period_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building" ADD CONSTRAINT "building_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building" ADD CONSTRAINT "building_street_id_street_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."street"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premise" ADD CONSTRAINT "premise_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premise" ADD CONSTRAINT "premise_building_id_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street" ADD CONSTRAINT "street_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street" ADD CONSTRAINT "street_settlement_id_settlement_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_number_per_tenant" ON "account" USING btree ("tenant_id","account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_per_tenant" ON "billing_period" USING btree ("tenant_id","year","month");