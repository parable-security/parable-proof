import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { evidenceRecords, reviews } from "@/lib/db/schema";
import type { EvidenceRecordInput } from "@/lib/validation/evidence-csv";

// Every function takes companyId first and filters by it.

// 12 columns x 1,000 rows stays well under Postgres's 65,535-parameter limit.
const INSERT_BATCH_SIZE = 1_000;

const reviewIdSchema = z.uuid();

export type ImportEvidenceResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "WRONG_STATUS" | "RAW_EXPORT_CHANGED" };

// Imports validated evidence in one transaction: all rows or none. The review
// row is locked first, so the status check, the inserts and the move to
// EVIDENCE_VALIDATED can't interleave with a raw-export replacement or a
// second import. expectedRawExportSha256 is the export staff converted.
export async function importEvidence(
  companyId: string,
  reviewId: string,
  userId: string,
  file: { fileName: string; storagePath: string; sha256: string },
  expectedRawExportSha256: string,
  evidence: { records: EvidenceRecordInput[]; rowCount: number; duplicateCount: number },
): Promise<ImportEvidenceResult> {
  if (!companyId) {
    throw new Error("companyId is required");
  }
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  const ofCompany = and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId));

  return db.transaction(async (tx): Promise<ImportEvidenceResult> => {
    const [review] = await tx
      .select({ status: reviews.status, rawExportSha256: reviews.rawExportSha256 })
      .from(reviews)
      .where(ofCompany)
      .for("update");
    if (!review) return { ok: false, error: "NOT_FOUND" };
    if (review.status !== "EVIDENCE_SUBMITTED") return { ok: false, error: "WRONG_STATUS" };
    if (review.rawExportSha256 !== expectedRawExportSha256) {
      return { ok: false, error: "RAW_EXPORT_CHANGED" };
    }

    for (let start = 0; start < evidence.records.length; start += INSERT_BATCH_SIZE) {
      const batch = evidence.records.slice(start, start + INSERT_BATCH_SIZE);
      await tx.insert(evidenceRecords).values(batch.map((record) => ({ ...record, reviewId })));
    }

    await tx
      .update(reviews)
      .set({
        evidenceFileName: file.fileName,
        evidenceStoragePath: file.storagePath,
        evidenceSha256: file.sha256,
        evidenceUploadedAt: sql`now()`,
        evidenceConvertedByUserId: userId,
        evidenceRowCount: evidence.rowCount,
        evidenceDuplicateCount: evidence.duplicateCount,
        status: "EVIDENCE_VALIDATED",
      })
      .where(ofCompany);
    return { ok: true };
  });
}
