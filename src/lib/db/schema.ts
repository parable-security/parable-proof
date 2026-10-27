// Drizzle schema for Parable Proof V0. Product decisions: docs/v0-user-journey.md, Part B.
// Every foreign key is ON DELETE RESTRICT: nothing is deleted by cascade.
// RLS is enabled on every table with no policies (deny-all for Supabase anon/authenticated);
// the app reads and writes server-side, scoped to the current company in code.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// ---------- Enums ----------

export const userRole = pgEnum("user_role", ["parable_staff", "customer_admin"]);

export const reviewStatus = pgEnum("review_status", [
  "DRAFT",
  "RULES_PENDING_APPROVAL",
  "RULES_APPROVED",
  "EVIDENCE_SUBMITTED",
  "EVIDENCE_VALIDATED",
  "RESULTS_READY",
  "FINALIZED",
]);

export const approvalStatus = pgEnum("approval_status", [
  "APPROVED",
  "CONDITIONAL",
  "PROHIBITED",
]);

export const findingResult = pgEnum("finding_result", [
  "COMPLIANT",
  "POLICY_EXCEPTION",
  "REVIEW_REQUIRED",
]);

export const checkType = pgEnum("check_type", [
  "prohibited_app",
  "unknown_ai_app",
  "unclassified_app",
  "unauthorized_user",
  "prohibited_permission",
  "name_match_only",
  "unlisted_permission",
  "compliant",
]);

export const resolutionStatus = pgEnum("resolution_status", ["OPEN", "RESOLVED"]);

export const assignmentScope = pgEnum("assignment_scope", ["TENANT", "USER"]);

export const appClassification = pgEnum("app_classification", ["AI", "NOT_AI"]);

// ---------- Shared columns ----------

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const emptyTextArray = sql`'{}'::text[]`;

// ---------- Tables ----------

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const users = pgTable(
  "users",
  {
    // Supabase auth user id; no default.
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "restrict",
    }),
    role: userRole("role").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    index("users_company_id_idx").on(t.companyId),
    check(
      "users_role_company_check",
      sql`(${t.role} = 'customer_admin' and ${t.companyId} is not null)
        or (${t.role} = 'parable_staff' and ${t.companyId} is null)`,
    ),
  ],
).enableRLS();

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewName: text("review_name").notNull(),
    reviewer: text("reviewer").notNull(),
    reviewDate: date("review_date").notNull().default(sql`current_date`),
    status: reviewStatus("status").notNull().default("DRAFT"),

    // Policy document as uploaded (raw file, deleted 90 days after the report).
    policyDocumentFileName: text("policy_document_file_name"),
    policyDocumentStoragePath: text("policy_document_storage_path"),
    policyDocumentUploadedAt: timestamp("policy_document_uploaded_at", {
      withTimezone: true,
    }),

    // Microsoft export as the customer uploaded it (raw file).
    rawExportFileName: text("raw_export_file_name"),
    rawExportStoragePath: text("raw_export_storage_path"),
    rawExportSha256: text("raw_export_sha256"),
    rawExportUploadedAt: timestamp("raw_export_uploaded_at", { withTimezone: true }),
    rawExportUploadedByUserId: uuid("raw_export_uploaded_by_user_id").references(
      () => users.id,
      { onDelete: "restrict" },
    ),

    // Evidence CSV converted by Parable staff (retained).
    evidenceFileName: text("evidence_file_name"),
    evidenceStoragePath: text("evidence_storage_path"),
    evidenceSha256: text("evidence_sha256"),
    evidenceUploadedAt: timestamp("evidence_uploaded_at", { withTimezone: true }),
    evidenceConvertedByUserId: uuid("evidence_converted_by_user_id").references(
      () => users.id,
      { onDelete: "restrict" },
    ),
    evidenceRowCount: integer("evidence_row_count"),
    evidenceDuplicateCount: integer("evidence_duplicate_count"),

    rawFilesDeletedAt: timestamp("raw_files_deleted_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    reportStoragePath: text("report_storage_path"),
    reportSha256: text("report_sha256"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reviews_company_id_idx").on(t.companyId),
    index("reviews_created_by_user_id_idx").on(t.createdByUserId),
    index("reviews_raw_export_uploaded_by_user_id_idx").on(t.rawExportUploadedByUserId),
    index("reviews_evidence_converted_by_user_id_idx").on(t.evidenceConvertedByUserId),
    check(
      "reviews_sha256_format",
      sql`(${t.rawExportSha256} is null or ${t.rawExportSha256} ~ '^[0-9a-f]{64}$')
        and (${t.evidenceSha256} is null or ${t.evidenceSha256} ~ '^[0-9a-f]{64}$')
        and (${t.reportSha256} is null or ${t.reportSha256} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "reviews_finalized_check",
      sql`(${t.status} = 'FINALIZED') = (${t.finalizedAt} is not null)`,
    ),
  ],
).enableRLS();

export const policyRules = pgTable(
  "policy_rules",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    appName: text("app_name").notNull(),
    appId: text("app_id"),
    servicePrincipalId: text("service_principal_id"),
    approvalStatus: approvalStatus("approval_status").notNull(),
    // "ALL" is a flag, never a string in a list.
    approvedForAll: boolean("approved_for_all").notNull().default(false),
    allPermissionsAllowed: boolean("all_permissions_allowed").notNull().default(false),
    allPermissionsProhibited: boolean("all_permissions_prohibited").notNull().default(false),
    approvedUsers: text("approved_users").array().notNull().default(emptyTextArray),
    approvedDepartments: text("approved_departments")
      .array()
      .notNull()
      .default(emptyTextArray),
    allowedPermissions: text("allowed_permissions")
      .array()
      .notNull()
      .default(emptyTextArray),
    prohibitedPermissions: text("prohibited_permissions")
      .array()
      .notNull()
      .default(emptyTextArray),
    notes: text("notes"),
    // CCO approval: null means pending approval.
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Soft delete: findings keep pointing at the rule; the engine ignores deleted rules.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("policy_rules_company_id_idx").on(t.companyId),
    index("policy_rules_approved_by_user_id_idx").on(t.approvedByUserId),
    uniqueIndex("policy_rules_company_app_id_unique")
      .on(t.companyId, t.appId)
      .where(sql`${t.appId} is not null and ${t.deletedAt} is null`),
    uniqueIndex("policy_rules_company_service_principal_id_unique")
      .on(t.companyId, t.servicePrincipalId)
      .where(sql`${t.servicePrincipalId} is not null and ${t.deletedAt} is null`),
    uniqueIndex("policy_rules_company_app_name_unique")
      .on(t.companyId, sql`lower(${t.appName})`)
      .where(sql`${t.appId} is null and ${t.deletedAt} is null`),
    check(
      "policy_rules_cco_approval_check",
      sql`(${t.approvedByUserId} is null) = (${t.approvedAt} is null)`,
    ),
    // APPROVED / CONDITIONAL rules must say who is approved.
    check(
      "policy_rules_population_required_check",
      sql`${t.approvalStatus} = 'PROHIBITED'
        or ${t.approvedForAll}
        or cardinality(${t.approvedUsers}) > 0
        or cardinality(${t.approvedDepartments}) > 0`,
    ),
    check(
      "policy_rules_approved_for_all_check",
      sql`not ${t.approvedForAll}
        or (cardinality(${t.approvedUsers}) = 0 and cardinality(${t.approvedDepartments}) = 0)`,
    ),
    check(
      "policy_rules_all_allowed_check",
      sql`not ${t.allPermissionsAllowed} or cardinality(${t.allowedPermissions}) = 0`,
    ),
    check(
      "policy_rules_all_prohibited_check",
      sql`not ${t.allPermissionsProhibited} or cardinality(${t.prohibitedPermissions}) = 0`,
    ),
    check(
      "policy_rules_all_flags_check",
      sql`not (${t.allPermissionsAllowed} and ${t.allPermissionsProhibited})`,
    ),
    // PROHIBITED rules: no population, all permissions prohibited (spec's Otter AI example).
    check(
      "policy_rules_prohibited_shape_check",
      sql`${t.approvalStatus} <> 'PROHIBITED'
        or (${t.allPermissionsProhibited}
          and not ${t.allPermissionsAllowed}
          and not ${t.approvedForAll}
          and cardinality(${t.approvedUsers}) = 0
          and cardinality(${t.approvedDepartments}) = 0
          and cardinality(${t.allowedPermissions}) = 0
          and cardinality(${t.prohibitedPermissions}) = 0)`,
    ),
    check(
      "policy_rules_all_prohibited_no_allowed_check",
      sql`not ${t.allPermissionsProhibited} or cardinality(${t.allowedPermissions}) = 0`,
    ),
  ],
).enableRLS();

// Immutable after import: no updated_at.
export const evidenceRecords = pgTable(
  "evidence_records",
  {
    id: id(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "restrict" }),
    rowNumber: integer("row_number").notNull(),
    userEmail: text("user_email"),
    appName: text("app_name").notNull(),
    appId: text("app_id").notNull(),
    servicePrincipalId: text("service_principal_id"),
    permissionScope: text("permission_scope").notNull(),
    consentType: text("consent_type").notNull(),
    resourceName: text("resource_name").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    assignmentScope: assignmentScope("assignment_scope").notNull(),
    userDepartment: text("user_department"),
    createdAt: createdAt(),
  },
  (t) => [
    index("evidence_records_review_id_idx").on(t.reviewId),
    uniqueIndex("evidence_records_review_row_unique").on(t.reviewId, t.rowNumber),
    check(
      "evidence_records_scope_email_check",
      sql`(${t.assignmentScope} = 'USER' and ${t.userEmail} is not null)
        or (${t.assignmentScope} = 'TENANT' and ${t.userEmail} is null)`,
    ),
  ],
).enableRLS();

export const findings = pgTable(
  "findings",
  {
    id: id(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "restrict" }),
    evidenceRecordId: uuid("evidence_record_id")
      .notNull()
      .references(() => evidenceRecords.id, { onDelete: "restrict" }),
    policyRuleId: uuid("policy_rule_id").references(() => policyRules.id, {
      onDelete: "restrict",
    }),
    // Frozen copy of the rule as it was at check time.
    policyRuleSnapshot: jsonb("policy_rule_snapshot"),
    checkType: checkType("check_type").notNull(),
    result: findingResult("result").notNull(),
    reason: text("reason").notNull(),
    appName: text("app_name").notNull(),
    appId: text("app_id"),
    servicePrincipalId: text("service_principal_id"),
    userEmail: text("user_email"),
    observedPermission: text("observed_permission").notNull(),
    resolutionStatus: resolutionStatus("resolution_status").notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    // Typed name for display; resolved_by_user_id is the account that clicked.
    resolvedBy: text("resolved_by"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("findings_review_id_idx").on(t.reviewId),
    index("findings_policy_rule_id_idx").on(t.policyRuleId),
    index("findings_resolved_by_user_id_idx").on(t.resolvedByUserId),
    index("findings_review_id_result_idx").on(t.reviewId, t.result),
    // Also serves as the index on evidence_record_id: at most one finding per row.
    uniqueIndex("findings_evidence_record_unique").on(t.evidenceRecordId),
    check(
      "findings_resolution_check",
      sql`(${t.resolutionStatus} = 'OPEN'
          and ${t.resolutionNote} is null
          and ${t.resolvedBy} is null
          and ${t.resolvedByUserId} is null
          and ${t.resolvedAt} is null)
        or (${t.resolutionStatus} = 'RESOLVED'
          and ${t.resolutionNote} is not null
          and btrim(${t.resolutionNote}) <> ''
          and ${t.resolvedBy} is not null
          and ${t.resolvedByUserId} is not null
          and ${t.resolvedAt} is not null)`,
    ),
    check(
      "findings_rule_snapshot_check",
      sql`(${t.policyRuleId} is null) = (${t.policyRuleSnapshot} is null)`,
    ),
    check(
      "findings_check_result_check",
      sql`(${t.checkType} = 'compliant' and ${t.result} = 'COMPLIANT')
        or (${t.checkType} in ('prohibited_app', 'unauthorized_user', 'prohibited_permission')
          and ${t.result} = 'POLICY_EXCEPTION')
        or (${t.checkType} in ('unknown_ai_app', 'unclassified_app', 'name_match_only', 'unlisted_permission')
          and ${t.result} = 'REVIEW_REQUIRED')`,
    ),
  ],
).enableRLS();

// Append-only: no updated_at.
export const findingNotes = pgTable(
  "finding_notes",
  {
    id: id(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "restrict" }),
    note: text("note").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    authorName: text("author_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("finding_notes_finding_id_idx").on(t.findingId),
    index("finding_notes_author_user_id_idx").on(t.authorUserId),
    check("finding_notes_note_not_empty", sql`btrim(${t.note}) <> ''`),
  ],
).enableRLS();

// Shared across all customers, maintained by Parable staff.
// The engine matches the catalog on app_id, then name; service_principal_id is tenant-specific.
export const appCatalog = pgTable(
  "app_catalog",
  {
    id: id(),
    appName: text("app_name").notNull(),
    appId: text("app_id"),
    servicePrincipalId: text("service_principal_id"),
    classification: appClassification("classification").notNull(),
    // Null means seeded by Parable.
    classifiedByUserId: uuid("classified_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("app_catalog_classified_by_user_id_idx").on(t.classifiedByUserId),
    uniqueIndex("app_catalog_app_id_unique")
      .on(t.appId)
      .where(sql`${t.appId} is not null`),
    uniqueIndex("app_catalog_app_name_unique")
      .on(sql`lower(${t.appName})`)
      .where(sql`${t.appId} is null`),
  ],
).enableRLS();
