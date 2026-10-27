import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";

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
