import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { policyRules, reviews } from "@/lib/db/schema";
import type { PolicyRuleInput } from "@/lib/validation/policy-rule";

// Every function takes companyId first and filters by it.
// Rules belong to the company, not to one review. Deleted rules are soft-deleted.

export type PolicyRule = PolicyRuleInput & {
  id: string;
  approvedAt: Date | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const uuidSchema = z.uuid();

const DUPLICATE_CONSTRAINTS = new Set([
  "policy_rules_company_app_id_unique",
  "policy_rules_company_service_principal_id_unique",
  "policy_rules_company_app_name_unique",
]);

function assertCompanyId(companyId: string) {
  if (!companyId) {
    throw new Error("companyId is required");
  }
}

// Drizzle wraps driver errors, so look at the error and its causes.
function isDuplicateRuleError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    const { code, constraint_name } = current as { code?: string; constraint_name?: string };
    if (code === "23505" && constraint_name && DUPLICATE_CONSTRAINTS.has(constraint_name)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const ruleColumns = {
  id: policyRules.id,
  appName: policyRules.appName,
  appId: policyRules.appId,
  servicePrincipalId: policyRules.servicePrincipalId,
  approvalStatus: policyRules.approvalStatus,
  approvedForAll: policyRules.approvedForAll,
  approvedUsers: policyRules.approvedUsers,
  approvedDepartments: policyRules.approvedDepartments,
  allPermissionsAllowed: policyRules.allPermissionsAllowed,
  allowedPermissions: policyRules.allowedPermissions,
  allPermissionsProhibited: policyRules.allPermissionsProhibited,
  prohibitedPermissions: policyRules.prohibitedPermissions,
  notes: policyRules.notes,
  approvedAt: policyRules.approvedAt,
};

function activeRuleOfCompany(companyId: string, ruleId: string) {
  return and(
    eq(policyRules.id, ruleId),
    eq(policyRules.companyId, companyId),
    isNull(policyRules.deletedAt),
  );
}

// Any rule change needs CCO approval again: early-stage reviews go back to pending.
// Reviews past RULES_APPROVED keep their status.
async function syncReviewsToPending(tx: Tx, companyId: string) {
  await tx
    .update(reviews)
    .set({ status: "RULES_PENDING_APPROVAL" })
    .where(
      and(eq(reviews.companyId, companyId), inArray(reviews.status, ["DRAFT", "RULES_APPROVED"])),
    );
}

export async function listActiveRules(companyId: string): Promise<PolicyRule[]> {
  assertCompanyId(companyId);
  return db
    .select(ruleColumns)
    .from(policyRules)
    .where(and(eq(policyRules.companyId, companyId), isNull(policyRules.deletedAt)))
    .orderBy(sql`lower(${policyRules.appName})`, policyRules.id);
}

// null when the id is not a UUID, does not exist, is deleted, or belongs to another company.
export async function getActiveRule(
  companyId: string,
  ruleId: string,
): Promise<PolicyRule | null> {
  assertCompanyId(companyId);
  if (!uuidSchema.safeParse(ruleId).success) {
    return null;
  }
  const [row] = await db
    .select(ruleColumns)
    .from(policyRules)
    .where(activeRuleOfCompany(companyId, ruleId))
    .limit(1);
  return row ?? null;
}

export async function createRule(
  companyId: string,
  input: PolicyRuleInput,
): Promise<{ ok: true; id: string } | { ok: false; error: "DUPLICATE" }> {
  assertCompanyId(companyId);
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(policyRules)
        .values({ ...input, companyId })
        .returning({ id: policyRules.id });
      await syncReviewsToPending(tx, companyId);
      return row.id;
    });
    return { ok: true, id };
  } catch (error) {
    if (isDuplicateRuleError(error)) return { ok: false, error: "DUPLICATE" };
    throw error;
  }
}

// Editing always clears the CCO approval (back to pending).
export async function updateRule(
  companyId: string,
  ruleId: string,
  input: PolicyRuleInput,
): Promise<{ ok: true } | { ok: false; error: "DUPLICATE" | "NOT_FOUND" }> {
  assertCompanyId(companyId);
  if (!uuidSchema.safeParse(ruleId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(policyRules)
        .set({ ...input, approvedByUserId: null, approvedAt: null })
        .where(activeRuleOfCompany(companyId, ruleId))
        .returning({ id: policyRules.id });
      if (rows.length === 0) return false;
      await syncReviewsToPending(tx, companyId);
      return true;
    });
    return updated ? { ok: true } : { ok: false, error: "NOT_FOUND" };
  } catch (error) {
    if (isDuplicateRuleError(error)) return { ok: false, error: "DUPLICATE" };
    throw error;
  }
}

// Soft delete: findings keep pointing at the rule. Returns false if not found.
export async function softDeleteRule(companyId: string, ruleId: string): Promise<boolean> {
  assertCompanyId(companyId);
  if (!uuidSchema.safeParse(ruleId).success) {
    return false;
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(policyRules)
      .set({ deletedAt: sql`now()` })
      .where(activeRuleOfCompany(companyId, ruleId))
      .returning({ id: policyRules.id });
    if (rows.length === 0) return false;
    await syncReviewsToPending(tx, companyId);
    return true;
  });
}

export type ApproveRulesResult =
  | { ok: true; approvedCount: number }
  | { ok: false; error: "NOT_FOUND" | "FINALIZED" | "NO_RULES" };

// CCO approval: approves every pending active rule of the company, then moves
// early-stage reviews to RULES_APPROVED. Never moves a later-stage review backwards.
export async function approveRules(
  companyId: string,
  reviewId: string,
  userId: string,
): Promise<ApproveRulesResult> {
  assertCompanyId(companyId);
  if (!uuidSchema.safeParse(reviewId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return db.transaction(async (tx): Promise<ApproveRulesResult> => {
    const [review] = await tx
      .select({ status: reviews.status })
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId)))
      .for("update");
    if (!review) return { ok: false, error: "NOT_FOUND" };
    if (review.status === "FINALIZED") return { ok: false, error: "FINALIZED" };

    const [{ activeCount }] = await tx
      .select({ activeCount: sql<number>`count(*)::int` })
      .from(policyRules)
      .where(and(eq(policyRules.companyId, companyId), isNull(policyRules.deletedAt)));
    if (activeCount === 0) return { ok: false, error: "NO_RULES" };

    const approved = await tx
      .update(policyRules)
      .set({ approvedByUserId: userId, approvedAt: sql`now()` })
      .where(
        and(
          eq(policyRules.companyId, companyId),
          isNull(policyRules.deletedAt),
          isNull(policyRules.approvedAt),
        ),
      )
      .returning({ id: policyRules.id });

    await tx
      .update(reviews)
      .set({ status: "RULES_APPROVED" })
      .where(
        and(
          eq(reviews.companyId, companyId),
          inArray(reviews.status, ["DRAFT", "RULES_PENDING_APPROVAL"]),
        ),
      );

    return { ok: true, approvedCount: approved.length };
  });
}
