import "server-only";

import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  appCatalog,
  evidenceRecords,
  findingNotes,
  findings,
  policyRules,
  reviews,
} from "@/lib/db/schema";
import { evaluateEvidence, type FindingResult } from "@/lib/engine/evaluate";

// Every function takes companyId first and filters by it.
// The engine trusts its caller: runPolicyCheck is the gatekeeper.

// About 12 columns x 1,000 rows stays well under Postgres's 65,535-parameter limit.
const INSERT_BATCH_SIZE = 1_000;

const reviewIdSchema = z.uuid();

function assertCompanyId(companyId: string) {
  if (!companyId) {
    throw new Error("companyId is required");
  }
}

export type RunPolicyCheckResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "NOT_FOUND"
        | "FINALIZED"
        | "WRONG_STATUS"
        | "NO_RULES"
        | "RULES_NOT_APPROVED"
        | "HAS_ACTIVITY";
    };

// Runs the four checks for a review in one transaction: all findings or none.
// The review row is locked first, and the company's active rules are read with
// FOR SHARE, so the approval gate and the engine input are the same snapshot
// and a concurrent rule edit waits until this commits. A re-run replaces the
// findings only while none has a note or a resolution; notes are never deleted.
export async function runPolicyCheck(
  companyId: string,
  reviewId: string,
): Promise<RunPolicyCheckResult> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  const ofCompany = and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId));

  return db.transaction(async (tx): Promise<RunPolicyCheckResult> => {
    const [review] = await tx
      .select({ status: reviews.status })
      .from(reviews)
      .where(ofCompany)
      .for("update");
    if (!review) return { ok: false, error: "NOT_FOUND" };
    if (review.status === "FINALIZED") return { ok: false, error: "FINALIZED" };
    if (review.status !== "EVIDENCE_VALIDATED" && review.status !== "RESULTS_READY") {
      return { ok: false, error: "WRONG_STATUS" };
    }

    const rules = await tx
      .select({
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
      })
      .from(policyRules)
      .where(and(eq(policyRules.companyId, companyId), isNull(policyRules.deletedAt)))
      .for("share");
    if (rules.length === 0) return { ok: false, error: "NO_RULES" };
    if (rules.some((rule) => rule.approvedAt === null)) {
      return { ok: false, error: "RULES_NOT_APPROVED" };
    }

    // The catalog is shared across customers: no company filter, by design.
    const catalog = await tx
      .select({
        id: appCatalog.id,
        appName: appCatalog.appName,
        appId: appCatalog.appId,
        classification: appCatalog.classification,
      })
      .from(appCatalog);

    // The review was proven to belong to this company above.
    const evidence = await tx
      .select({
        id: evidenceRecords.id,
        rowNumber: evidenceRecords.rowNumber,
        userEmail: evidenceRecords.userEmail,
        appName: evidenceRecords.appName,
        appId: evidenceRecords.appId,
        servicePrincipalId: evidenceRecords.servicePrincipalId,
        permissionScope: evidenceRecords.permissionScope,
        consentType: evidenceRecords.consentType,
        resourceName: evidenceRecords.resourceName,
        observedAt: evidenceRecords.observedAt,
        assignmentScope: evidenceRecords.assignmentScope,
        userDepartment: evidenceRecords.userDepartment,
      })
      .from(evidenceRecords)
      .where(eq(evidenceRecords.reviewId, reviewId));

    const results = evaluateEvidence({ rules, catalog, evidence });

    if (review.status === "RESULTS_READY") {
      const hasNote = sql`exists (select 1 from ${findingNotes} where ${findingNotes.findingId} = ${findings.id})`;
      const [{ total, withActivity }] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          withActivity: sql<number>`(count(*) filter (where ${findings.resolutionStatus} = 'RESOLVED' or ${hasNote}))::int`,
        })
        .from(findings)
        .where(eq(findings.reviewId, reviewId));
      if (withActivity > 0) return { ok: false, error: "HAS_ACTIVITY" };

      // Guarded: deletes only open findings without notes. A count mismatch
      // means one was resolved or noted meanwhile, so roll everything back.
      const deleted = await tx
        .delete(findings)
        .where(
          and(
            eq(findings.reviewId, reviewId),
            eq(findings.resolutionStatus, "OPEN"),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(findingNotes)
                .where(eq(findingNotes.findingId, findings.id)),
            ),
          ),
        )
        .returning({ id: findings.id });
      if (deleted.length !== total) {
        throw new Error("Findings changed during the policy check re-run");
      }
    }

    for (let start = 0; start < results.length; start += INSERT_BATCH_SIZE) {
      const batch = results.slice(start, start + INSERT_BATCH_SIZE);
      await tx.insert(findings).values(batch.map((finding) => ({ ...finding, reviewId })));
    }

    await tx.update(reviews).set({ status: "RESULTS_READY" }).where(ofCompany);
    return { ok: true };
  });
}

export type FindingListItem = {
  id: string;
  appName: string;
  appId: string | null;
  userEmail: string | null;
  observedPermission: string;
  result: FindingResult;
  reason: string;
  // Frozen copy of the rule at check time (null when no rule matched).
  policyRuleSnapshot: unknown;
};

// The review's findings: exceptions first, then review required, then
// compliant; within each, by application name and evidence row. Returns null
// when the id is not a UUID. The join on reviews scopes it to the company.
export async function listFindings(
  companyId: string,
  reviewId: string,
): Promise<FindingListItem[] | null> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return null;
  }
  return db
    .select({
      id: findings.id,
      appName: findings.appName,
      appId: findings.appId,
      userEmail: findings.userEmail,
      observedPermission: findings.observedPermission,
      result: findings.result,
      reason: findings.reason,
      policyRuleSnapshot: findings.policyRuleSnapshot,
    })
    .from(findings)
    .innerJoin(
      reviews,
      and(
        eq(reviews.id, findings.reviewId),
        eq(reviews.id, reviewId),
        eq(reviews.companyId, companyId),
      ),
    )
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, findings.evidenceRecordId))
    .orderBy(
      sql`case ${findings.result} when 'POLICY_EXCEPTION' then 0 when 'REVIEW_REQUIRED' then 1 else 2 end`,
      sql`lower(${findings.appName})`,
      evidenceRecords.rowNumber,
    );
}
