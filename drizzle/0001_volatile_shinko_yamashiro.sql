ALTER TABLE "policy_rules" ADD COLUMN "approved_for_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD COLUMN "all_permissions_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD COLUMN "all_permissions_prohibited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_population_required_check" CHECK ("policy_rules"."approval_status" = 'PROHIBITED'
        or "policy_rules"."approved_for_all"
        or cardinality("policy_rules"."approved_users") > 0
        or cardinality("policy_rules"."approved_departments") > 0);--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_approved_for_all_check" CHECK (not "policy_rules"."approved_for_all"
        or (cardinality("policy_rules"."approved_users") = 0 and cardinality("policy_rules"."approved_departments") = 0));--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_all_allowed_check" CHECK (not "policy_rules"."all_permissions_allowed" or cardinality("policy_rules"."allowed_permissions") = 0);--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_all_prohibited_check" CHECK (not "policy_rules"."all_permissions_prohibited" or cardinality("policy_rules"."prohibited_permissions") = 0);--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_all_flags_check" CHECK (not ("policy_rules"."all_permissions_allowed" and "policy_rules"."all_permissions_prohibited"));--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_prohibited_shape_check" CHECK ("policy_rules"."approval_status" <> 'PROHIBITED'
        or ("policy_rules"."all_permissions_prohibited"
          and not "policy_rules"."all_permissions_allowed"
          and not "policy_rules"."approved_for_all"
          and cardinality("policy_rules"."approved_users") = 0
          and cardinality("policy_rules"."approved_departments") = 0
          and cardinality("policy_rules"."allowed_permissions") = 0
          and cardinality("policy_rules"."prohibited_permissions") = 0));--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_all_prohibited_no_allowed_check" CHECK (not "policy_rules"."all_permissions_prohibited" or cardinality("policy_rules"."allowed_permissions") = 0);