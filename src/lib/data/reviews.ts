import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { canUploadFile, type FileKind } from "@/lib/validation/review-file";

// Every function takes companyId first and filters by it.
// Pages and actions get companyId from requireRole(), never from user input.

export type ReviewStatus = (typeof reviews.$inferSelect)["status"];

export type ReviewListItem = {
  id: string;
  reviewName: string;
  reviewDate: string;
  status: ReviewStatus;
};

export type Review = ReviewListItem & { reviewer: string };

export type NewReviewInput = {
  reviewName: string;
  reviewer: string;
  // YYYY-MM-DD
  reviewDate: string;
};

function assertCompanyId(companyId: string) {
  if (!companyId) {
    throw new Error("companyId is required");
  }
}

const reviewIdSchema = z.uuid();

export async function listReviews(companyId: string): Promise<ReviewListItem[]> {
  assertCompanyId(companyId);
  return db
    .select({
      id: reviews.id,
      reviewName: reviews.reviewName,
      reviewDate: reviews.reviewDate,
      status: reviews.status,
    })
    .from(reviews)
    .where(eq(reviews.companyId, companyId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));
}

// Returns null when the id is not a UUID, does not exist, or belongs to
// another company. Callers treat all three the same (404).
export async function getReview(
  companyId: string,
  reviewId: string,
): Promise<Review | null> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return null;
  }
  const [row] = await db
    .select({
      id: reviews.id,
      reviewName: reviews.reviewName,
      reviewer: reviews.reviewer,
      reviewDate: reviews.reviewDate,
      status: reviews.status,
    })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

export type StoredFile = { fileName: string; storagePath: string; uploadedAt: Date | null };

export type ReviewFiles = {
  id: string;
  status: ReviewStatus;
  policyDocument: StoredFile | null;
  rawExport: (StoredFile & { sha256: string | null }) | null;
};

// The review's uploaded files. A file is null when none was uploaded or the
// raw files have been deleted (90-day retention).
export async function getReviewFiles(
  companyId: string,
  reviewId: string,
): Promise<ReviewFiles | null> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return null;
  }
  const [row] = await db
    .select({
      id: reviews.id,
      status: reviews.status,
      policyDocumentFileName: reviews.policyDocumentFileName,
      policyDocumentStoragePath: reviews.policyDocumentStoragePath,
      policyDocumentUploadedAt: reviews.policyDocumentUploadedAt,
      rawExportFileName: reviews.rawExportFileName,
      rawExportStoragePath: reviews.rawExportStoragePath,
      rawExportSha256: reviews.rawExportSha256,
      rawExportUploadedAt: reviews.rawExportUploadedAt,
      rawFilesDeletedAt: reviews.rawFilesDeletedAt,
    })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId)))
    .limit(1);
  if (!row) return null;

  const deleted = row.rawFilesDeletedAt !== null;
  return {
    id: row.id,
    status: row.status,
    policyDocument:
      !deleted && row.policyDocumentFileName && row.policyDocumentStoragePath
        ? {
            fileName: row.policyDocumentFileName,
            storagePath: row.policyDocumentStoragePath,
            uploadedAt: row.policyDocumentUploadedAt,
          }
        : null,
    rawExport:
      !deleted && row.rawExportFileName && row.rawExportStoragePath
        ? {
            fileName: row.rawExportFileName,
            storagePath: row.rawExportStoragePath,
            uploadedAt: row.rawExportUploadedAt,
            sha256: row.rawExportSha256,
          }
        : null,
  };
}

export type SetReviewFileResult =
  | { ok: true; previousPath: string | null }
  | { ok: false; error: "NOT_FOUND" | "WRONG_STATUS" };

// Records an uploaded file on the review. The status check and the update run
// under a row lock, so a concurrent approval or upload can't slip in between.
// A raw export moves the review to EVIDENCE_SUBMITTED.
export async function setReviewFile(
  companyId: string,
  reviewId: string,
  userId: string,
  kind: FileKind,
  file: { fileName: string; storagePath: string; sha256: string },
): Promise<SetReviewFileResult> {
  assertCompanyId(companyId);
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return { ok: false, error: "NOT_FOUND" };
  }
  const ofCompany = and(eq(reviews.id, reviewId), eq(reviews.companyId, companyId));
  return db.transaction(async (tx): Promise<SetReviewFileResult> => {
    const [review] = await tx
      .select({
        status: reviews.status,
        policyDocumentStoragePath: reviews.policyDocumentStoragePath,
        rawExportStoragePath: reviews.rawExportStoragePath,
      })
      .from(reviews)
      .where(ofCompany)
      .for("update");
    if (!review) return { ok: false, error: "NOT_FOUND" };
    if (!canUploadFile(kind, review.status)) return { ok: false, error: "WRONG_STATUS" };

    if (kind === "policy_document") {
      await tx
        .update(reviews)
        .set({
          policyDocumentFileName: file.fileName,
          policyDocumentStoragePath: file.storagePath,
          policyDocumentUploadedAt: sql`now()`,
        })
        .where(ofCompany);
      return { ok: true, previousPath: review.policyDocumentStoragePath };
    }

    await tx
      .update(reviews)
      .set({
        rawExportFileName: file.fileName,
        rawExportStoragePath: file.storagePath,
        rawExportSha256: file.sha256,
        rawExportUploadedAt: sql`now()`,
        rawExportUploadedByUserId: userId,
        status: "EVIDENCE_SUBMITTED",
      })
      .where(ofCompany);
    return { ok: true, previousPath: review.rawExportStoragePath };
  });
}

export async function createReview(
  companyId: string,
  userId: string,
  input: NewReviewInput,
): Promise<{ id: string }> {
  assertCompanyId(companyId);
  const [row] = await db
    .insert(reviews)
    .values({
      companyId,
      createdByUserId: userId,
      reviewName: input.reviewName,
      reviewer: input.reviewer,
      reviewDate: input.reviewDate,
      status: "DRAFT",
    })
    .returning({ id: reviews.id });
  return row;
}
