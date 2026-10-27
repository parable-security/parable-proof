CREATE TYPE "public"."app_classification" AS ENUM('AI', 'NOT_AI');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('APPROVED', 'CONDITIONAL', 'PROHIBITED');--> statement-breakpoint
CREATE TYPE "public"."assignment_scope" AS ENUM('TENANT', 'USER');--> statement-breakpoint
CREATE TYPE "public"."check_type" AS ENUM('prohibited_app', 'unknown_ai_app', 'unclassified_app', 'unauthorized_user', 'prohibited_permission', 'name_match_only', 'unlisted_permission', 'compliant');--> statement-breakpoint
CREATE TYPE "public"."finding_result" AS ENUM('COMPLIANT', 'POLICY_EXCEPTION', 'REVIEW_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('DRAFT', 'RULES_PENDING_APPROVAL', 'RULES_APPROVED', 'EVIDENCE_SUBMITTED', 'EVIDENCE_VALIDATED', 'RESULTS_READY', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('parable_staff', 'customer_admin');--> statement-breakpoint
CREATE TABLE "app_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_name" text NOT NULL,
	"app_id" text,
	"service_principal_id" text,
	"classification" "app_classification" NOT NULL,
	"classified_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"user_email" text,
	"app_name" text NOT NULL,
	"app_id" text NOT NULL,
	"service_principal_id" text,
	"permission_scope" text NOT NULL,
	"consent_type" text NOT NULL,
	"resource_name" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"assignment_scope" "assignment_scope" NOT NULL,
	"user_department" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_records_scope_email_check" CHECK (("evidence_records"."assignment_scope" = 'USER' and "evidence_records"."user_email" is not null)
        or ("evidence_records"."assignment_scope" = 'TENANT' and "evidence_records"."user_email" is null))
);
--> statement-breakpoint
ALTER TABLE "evidence_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finding_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"note" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_notes_note_not_empty" CHECK (btrim("finding_notes"."note") <> '')
);
--> statement-breakpoint
ALTER TABLE "finding_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"evidence_record_id" uuid NOT NULL,
	"policy_rule_id" uuid,
	"policy_rule_snapshot" jsonb,
	"check_type" "check_type" NOT NULL,
	"result" "finding_result" NOT NULL,
	"reason" text NOT NULL,
	"app_name" text NOT NULL,
	"app_id" text,
	"service_principal_id" text,
	"user_email" text,
	"observed_permission" text NOT NULL,
	"resolution_status" "resolution_status" DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"resolved_by" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_resolution_check" CHECK (("findings"."resolution_status" = 'OPEN'
          and "findings"."resolution_note" is null
          and "findings"."resolved_by" is null
          and "findings"."resolved_by_user_id" is null
          and "findings"."resolved_at" is null)
        or ("findings"."resolution_status" = 'RESOLVED'
          and "findings"."resolution_note" is not null
          and btrim("findings"."resolution_note") <> ''
          and "findings"."resolved_by" is not null
          and "findings"."resolved_by_user_id" is not null
          and "findings"."resolved_at" is not null)),
	CONSTRAINT "findings_rule_snapshot_check" CHECK (("findings"."policy_rule_id" is null) = ("findings"."policy_rule_snapshot" is null)),
	CONSTRAINT "findings_check_result_check" CHECK (("findings"."check_type" = 'compliant' and "findings"."result" = 'COMPLIANT')
        or ("findings"."check_type" in ('prohibited_app', 'unauthorized_user', 'prohibited_permission')
          and "findings"."result" = 'POLICY_EXCEPTION')
        or ("findings"."check_type" in ('unknown_ai_app', 'unclassified_app', 'name_match_only', 'unlisted_permission')
          and "findings"."result" = 'REVIEW_REQUIRED'))
);
--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"app_name" text NOT NULL,
	"app_id" text,
	"service_principal_id" text,
	"approval_status" "approval_status" NOT NULL,
	"approved_users" text[] DEFAULT '{}'::text[] NOT NULL,
	"approved_departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"prohibited_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_rules_cco_approval_check" CHECK (("policy_rules"."approved_by_user_id" is null) = ("policy_rules"."approved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "policy_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"review_name" text NOT NULL,
	"reviewer" text NOT NULL,
	"review_date" date DEFAULT current_date NOT NULL,
	"status" "review_status" DEFAULT 'DRAFT' NOT NULL,
	"policy_document_file_name" text,
	"policy_document_storage_path" text,
	"policy_document_uploaded_at" timestamp with time zone,
	"raw_export_file_name" text,
	"raw_export_storage_path" text,
	"raw_export_sha256" text,
	"raw_export_uploaded_at" timestamp with time zone,
	"raw_export_uploaded_by_user_id" uuid,
	"evidence_file_name" text,
	"evidence_storage_path" text,
	"evidence_sha256" text,
	"evidence_uploaded_at" timestamp with time zone,
	"evidence_converted_by_user_id" uuid,
	"evidence_row_count" integer,
	"evidence_duplicate_count" integer,
	"raw_files_deleted_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"report_storage_path" text,
	"report_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_sha256_format" CHECK (("reviews"."raw_export_sha256" is null or "reviews"."raw_export_sha256" ~ '^[0-9a-f]{64}$')
        and ("reviews"."evidence_sha256" is null or "reviews"."evidence_sha256" ~ '^[0-9a-f]{64}$')
        and ("reviews"."report_sha256" is null or "reviews"."report_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "reviews_finalized_check" CHECK (("reviews"."status" = 'FINALIZED') = ("reviews"."finalized_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_company_check" CHECK (("users"."role" = 'customer_admin' and "users"."company_id" is not null)
        or ("users"."role" = 'parable_staff' and "users"."company_id" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_catalog" ADD CONSTRAINT "app_catalog_classified_by_user_id_users_id_fk" FOREIGN KEY ("classified_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_notes" ADD CONSTRAINT "finding_notes_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_notes" ADD CONSTRAINT "finding_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_evidence_record_id_evidence_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_policy_rule_id_policy_rules_id_fk" FOREIGN KEY ("policy_rule_id") REFERENCES "public"."policy_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_raw_export_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("raw_export_uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_evidence_converted_by_user_id_users_id_fk" FOREIGN KEY ("evidence_converted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_catalog_classified_by_user_id_idx" ON "app_catalog" USING btree ("classified_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_catalog_app_id_unique" ON "app_catalog" USING btree ("app_id") WHERE "app_catalog"."app_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "app_catalog_app_name_unique" ON "app_catalog" USING btree (lower("app_name")) WHERE "app_catalog"."app_id" is null;--> statement-breakpoint
CREATE INDEX "evidence_records_review_id_idx" ON "evidence_records" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_records_review_row_unique" ON "evidence_records" USING btree ("review_id","row_number");--> statement-breakpoint
CREATE INDEX "finding_notes_finding_id_idx" ON "finding_notes" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "finding_notes_author_user_id_idx" ON "finding_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "findings_review_id_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "findings_policy_rule_id_idx" ON "findings" USING btree ("policy_rule_id");--> statement-breakpoint
CREATE INDEX "findings_resolved_by_user_id_idx" ON "findings" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "findings_review_id_result_idx" ON "findings" USING btree ("review_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_evidence_record_unique" ON "findings" USING btree ("evidence_record_id");--> statement-breakpoint
CREATE INDEX "policy_rules_company_id_idx" ON "policy_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "policy_rules_approved_by_user_id_idx" ON "policy_rules" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rules_company_app_id_unique" ON "policy_rules" USING btree ("company_id","app_id") WHERE "policy_rules"."app_id" is not null and "policy_rules"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rules_company_service_principal_id_unique" ON "policy_rules" USING btree ("company_id","service_principal_id") WHERE "policy_rules"."service_principal_id" is not null and "policy_rules"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_rules_company_app_name_unique" ON "policy_rules" USING btree ("company_id",lower("app_name")) WHERE "policy_rules"."app_id" is null and "policy_rules"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_company_id_idx" ON "reviews" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "reviews_created_by_user_id_idx" ON "reviews" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "reviews_raw_export_uploaded_by_user_id_idx" ON "reviews" USING btree ("raw_export_uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "reviews_evidence_converted_by_user_id_idx" ON "reviews" USING btree ("evidence_converted_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_company_id_idx" ON "users" USING btree ("company_id");