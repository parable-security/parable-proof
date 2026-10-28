import "server-only";

import { and, asc, eq, isNull, ne, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  appCatalog,
  evidenceRecords,
  findingNotes,
  findings,
  policyRules,
  reviews,
  users,
} from "@/lib/db/schema";
import { evaluateEvidence, type FindingResult } from "@/lib/engine/evaluate";
import type { ResolveFindingInput } from "@/lib/validation/finding-actions";

// Every function takes companyId first and filters by it.
// The engine trusts its caller: runPolicyCheck is the gatekeeper.

// About 12 columns x 1,000 rows stays well under Postgres's 65,535-parameter limit.
const INSERT_BATCH_SIZE = 1_000;

const reviewIdSchema = z.uuid();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  resolutionStatus: "OPEN" | "RESOLVED";
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
      resolutionStatus: findings.resolutionStatus,
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

export type FindingNote = { id: string; note: string; authorName: string; createdAt: Date };

export type FindingDetail = {
  id: string;
  appName: string;
  result: FindingResult;
  reason: string;
  policyRuleId: string | null;
  // Frozen copy of the rule at check time (null when no rule matched).
  policyRuleSnapshot: unknown;
  // none: no rule matched; active: the rule still exists; deleted: soft-deleted since.
  ruleState: "none" | "active" | "deleted";
  resolutionStatus: "OPEN" | "RESOLVED";
  resolutionNote: string | null;
  resolvedBy: string | null;
  // Full name of the account that clicked Mark Resolved (the proof).
  resolvedByAccountName: string | null;
  resolvedAt: Date | null;
  evidence: {
    rowNumber: number;
    userEmail: string | null;
    appName: string;
    appId: string;
    permissionScope: string;
    consentType: string;
    resourceName: string;
    observedAt: Date;
  };
  notes: FindingNote[];
};

// One finding of this company's review, with its evidence row and notes
// (oldest first). null when an id is not a UUID, the finding does not exist,
// or it belongs to another review or company.
export async function getFindingDetail(
  companyId: string,
  reviewId: string,
  findingId: string,
): Promise<FindingDetail | null> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success || !reviewIdSchema.safeParse(findingId).success) {
    return null;
  }
  const [row] = await db
    .select({
      id: findings.id,
      appName: findings.appName,
      result: findings.result,
      reason: findings.reason,
      policyRuleId: findings.policyRuleId,
      policyRuleSnapshot: findings.policyRuleSnapshot,
      activeRuleId: policyRules.id,
      resolutionStatus: findings.resolutionStatus,
      resolutionNote: findings.resolutionNote,
      resolvedBy: findings.resolvedBy,
      resolvedByAccountName: users.fullName,
      resolvedAt: findings.resolvedAt,
      evidence: {
        rowNumber: evidenceRecords.rowNumber,
        userEmail: evidenceRecords.userEmail,
        appName: evidenceRecords.appName,
        appId: evidenceRecords.appId,
        permissionScope: evidenceRecords.permissionScope,
        consentType: evidenceRecords.consentType,
        resourceName: evidenceRecords.resourceName,
        observedAt: evidenceRecords.observedAt,
      },
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
    .leftJoin(
      policyRules,
      and(
        eq(policyRules.id, findings.policyRuleId),
        eq(policyRules.companyId, companyId),
        isNull(policyRules.deletedAt),
      ),
    )
    .leftJoin(users, eq(users.id, findings.resolvedByUserId))
    .where(eq(findings.id, findingId))
    .limit(1);
  if (!row) return null;

  // The finding was proven to belong to this company above.
  const notes = await db
    .select({
      id: findingNotes.id,
      note: findingNotes.note,
      authorName: findingNotes.authorName,
      createdAt: findingNotes.createdAt,
    })
    .from(findingNotes)
    .where(eq(findingNotes.findingId, row.id))
    .orderBy(asc(findingNotes.createdAt), asc(findingNotes.id));

  const { activeRuleId, ...finding } = row;
  return {
    ...finding,
    ruleState: finding.policyRuleId === null ? "none" : activeRuleId ? "active" : "deleted",
    notes,
  };
}

export type FindingActionError = "NOT_FOUND" | "FINALIZED" | "WRONG_STATUS";

// Locks this company's review FOR SHARE and requires RESULTS_READY. The lock
// conflicts with runPolicyCheck's FOR UPDATE, so a re-run cannot delete
// findings mid-action. Finalizing a review must also lock it FOR UPDATE.
async function lockReviewForFindingChange(
  tx: Tx,
  companyId: string,
  reviewId: string,
): Promise<FindingActionError | null> {
  const [review] = await tx
    .select({ status: reviews.status })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId)))
    .for("share");
  if (!review) return "NOT_FOUND";
  if (review.status === "FINALIZED") return "FINALIZED";
  if (review.status !== "RESULTS_READY") return "WRONG_STATUS";
  return null;
}

export type ResolveFindingResult =
  | { ok: true }
  | { ok: false; error: FindingActionError | "NOT_RESOLVABLE" };

// Mark Resolved. Only an OPEN, non-COMPLIANT finding can be resolved, once:
// there is no undo. resolved_at comes from the database clock.
export async function resolveFinding(
  companyId: string,
  reviewId: string,
  findingId: string,
  userId: string,
  input: ResolveFindingInput,
): Promise<ResolveFindingResult> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success || !reviewIdSchema.safeParse(findingId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return db.transaction(async (tx): Promise<ResolveFindingResult> => {
    const lockError = await lockReviewForFindingChange(tx, companyId, reviewId);
    if (lockError) return { ok: false, error: lockError };

    // The review was proven to belong to this company above. A concurrent
    // resolve re-checks resolution_status after it commits and matches nothing.
    const updated = await tx
      .update(findings)
      .set({
        resolutionStatus: "RESOLVED",
        resolutionNote: input.resolutionNote,
        resolvedBy: input.resolvedBy,
        resolvedByUserId: userId,
        resolvedAt: sql`now()`,
      })
      .where(
        and(
          eq(findings.id, findingId),
          eq(findings.reviewId, reviewId),
          eq(findings.resolutionStatus, "OPEN"),
          ne(findings.result, "COMPLIANT"),
        ),
      )
      .returning({ id: findings.id });
    if (updated.length === 0) return { ok: false, error: "NOT_RESOLVABLE" };
    return { ok: true };
  });
}

export type AddFindingNoteResult = { ok: true } | { ok: false; error: FindingActionError };

// Add Note: append-only. The author comes from the signed-in account.
export async function addFindingNote(
  companyId: string,
  reviewId: string,
  findingId: string,
  author: { userId: string; fullName: string },
  note: string,
): Promise<AddFindingNoteResult> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success || !reviewIdSchema.safeParse(findingId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return db.transaction(async (tx): Promise<AddFindingNoteResult> => {
    const lockError = await lockReviewForFindingChange(tx, companyId, reviewId);
    if (lockError) return { ok: false, error: lockError };

    const [finding] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(and(eq(findings.id, findingId), eq(findings.reviewId, reviewId)));
    if (!finding) return { ok: false, error: "NOT_FOUND" };

    await tx.insert(findingNotes).values({
      findingId: finding.id,
      note,
      authorUserId: author.userId,
      authorName: author.fullName,
    });
    return { ok: true };
  });
}
