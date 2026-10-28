import "server-only";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { companies, reviews } from "@/lib/db/schema";

import type { ReviewStatus } from "./reviews";

// The only cross-company queries, for Parable staff. Each function checks the
// role itself, so it can't be used from customer code even by mistake.
// Staff never send or receive a companyId: getReviewScopeForStaff looks it up
// from the review, and staff code then calls the company-scoped functions with it.

export type StaffReviewListItem = {
  id: string;
  companyName: string;
  reviewName: string;
  status: ReviewStatus;
  rawExportUploadedAt: Date | null;
  createdAt: Date;
};

export type StaffReviewScope = { companyId: string; reviewId: string; companyName: string };

const reviewIdSchema = z.uuid();

export async function listReviewsForStaff(): Promise<StaffReviewListItem[]> {
  await requireRole("parable_staff");
  return db
    .select({
      id: reviews.id,
      companyName: companies.name,
      reviewName: reviews.reviewName,
      status: reviews.status,
      rawExportUploadedAt: reviews.rawExportUploadedAt,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(companies, eq(companies.id, reviews.companyId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));
}

// The review's company, from the database. null when the id is not a UUID or
// the review does not exist (callers respond 404).
export async function getReviewScopeForStaff(reviewId: string): Promise<StaffReviewScope | null> {
  await requireRole("parable_staff");
  if (!reviewIdSchema.safeParse(reviewId).success) {
    return null;
  }
  const [row] = await db
    .select({
      companyId: reviews.companyId,
      reviewId: reviews.id,
      companyName: companies.name,
    })
    .from(reviews)
    .innerJoin(companies, eq(companies.id, reviews.companyId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return row ?? null;
}
