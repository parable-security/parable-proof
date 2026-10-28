import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { companies, evidenceRecords, findingNotes, findings, reviews, users } from "@/lib/db/schema";
import type { ReportFindingInput, ReportInput } from "@/lib/report/model";

// Screen 7: finalizing a review. Every function takes companyId first and filters by it.

const reviewIdSchema = z.uuid();

// Everything the report needs that comes from the database.
export type ReportData = Omit<ReportInput, "reportId" | "finalizedByName">;

export type ProduceReportResult =
  | { ok: true; storagePath: string; sha256: string }
  | { ok: false; error: "UPLOAD_FAILED" };

export type FinalizeReviewResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "FINALIZED" | "WRONG_STATUS" | "UPLOAD_FAILED" };

// One transaction. The review row is locked FOR UPDATE first, so this waits
// for an in-flight Mark Resolved or Add Note (FOR SHARE) and serializes with
// Run check and Approve (FOR UPDATE); after commit they all see FINALIZED.
// produce() renders and uploads the PDF while the lock is held, so the report
// shows exactly the data that gets frozen. Nothing is written unless it succeeds.
export async function finalizeReview(
  companyId: string,
  reviewId: string,
  userId: string,
  produce: (data: ReportData) => Promise<ProduceReportResult>,
): Promise<FinalizeReviewResult> {
  if (!companyId) {
    throw new Error("companyId is required");
  }
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  const ofCompany = and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId));

  return db.transaction(async (tx): Promise<FinalizeReviewResult> => {
    const [review] = await tx
      .select({
        status: reviews.status,
        reviewName: reviews.reviewName,
        reviewer: reviews.reviewer,
        reviewDate: reviews.reviewDate,
        evidenceFileName: reviews.evidenceFileName,
        evidenceSha256: reviews.evidenceSha256,
        rawExportSha256: reviews.rawExportSha256,
        companyName: companies.name,
        // The transaction's start time: the same value now() writes below,
        // so the time printed in the PDF equals finalized_at.
        finalizedAt: sql`now()`.mapWith(reviews.finalizedAt),
      })
      .from(reviews)
      .innerJoin(companies, eq(companies.id, reviews.companyId))
      .where(ofCompany)
      .for("update", { of: reviews });
    if (!review) return { ok: false, error: "NOT_FOUND" };
    if (review.status === "FINALIZED") return { ok: false, error: "FINALIZED" };
    if (review.status !== "RESULTS_READY") return { ok: false, error: "WRONG_STATUS" };
    if (!review.evidenceFileName || !review.evidenceSha256) {
      throw new Error("RESULTS_READY review has no evidence file");
    }

    // The review was proven to belong to this company above.
    const rows = await tx
      .select({
        id: findings.id,
        appName: findings.appName,
        appId: findings.appId,
        userEmail: findings.userEmail,
        observedPermission: findings.observedPermission,
        result: findings.result,
        policyRuleSnapshot: findings.policyRuleSnapshot,
        evidenceRowNumber: evidenceRecords.rowNumber,
        observedAt: evidenceRecords.observedAt,
        resolutionStatus: findings.resolutionStatus,
        resolutionNote: findings.resolutionNote,
        resolvedBy: findings.resolvedBy,
        resolvedByAccountName: users.fullName,
        resolvedAt: findings.resolvedAt,
      })
      .from(findings)
      .innerJoin(evidenceRecords, eq(evidenceRecords.id, findings.evidenceRecordId))
      .leftJoin(users, eq(users.id, findings.resolvedByUserId))
      .where(eq(findings.reviewId, reviewId));

    const notes = await tx
      .select({
        findingId: findingNotes.findingId,
        note: findingNotes.note,
        authorName: findingNotes.authorName,
        createdAt: findingNotes.createdAt,
      })
      .from(findingNotes)
      .innerJoin(
        findings,
        and(eq(findings.id, findingNotes.findingId), eq(findings.reviewId, reviewId)),
      )
      .orderBy(asc(findingNotes.createdAt), asc(findingNotes.id));

    const notesByFinding = new Map<string, ReportFindingInput["notes"]>();
    for (const { findingId, ...note } of notes) {
      const list = notesByFinding.get(findingId) ?? [];
      list.push(note);
      notesByFinding.set(findingId, list);
    }

    const produced = await produce({
      companyName: review.companyName,
      reviewName: review.reviewName,
      reviewDate: review.reviewDate,
      reviewer: review.reviewer,
      finalizedAt: review.finalizedAt,
      evidenceFileName: review.evidenceFileName,
      evidenceSha256: review.evidenceSha256,
      rawExportSha256: review.rawExportSha256,
      findings: rows.map((row) => ({ ...row, notes: notesByFinding.get(row.id) ?? [] })),
    });
    if (!produced.ok) return produced;

    const updated = await tx
      .update(reviews)
      .set({
        status: "FINALIZED",
        finalizedAt: sql`now()`,
        finalizedByUserId: userId,
        reportStoragePath: produced.storagePath,
        reportSha256: produced.sha256,
      })
      .where(and(ofCompany, eq(reviews.status, "RESULTS_READY")))
      .returning({ id: reviews.id });
    if (updated.length !== 1) {
      throw new Error("Review changed while it was being finalized");
    }
    return { ok: true };
  });
}
