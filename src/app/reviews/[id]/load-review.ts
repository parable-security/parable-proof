import "server-only";

import { notFound } from "next/navigation";

import { getReview, type Review } from "@/lib/data/reviews";

// The review, if it exists and belongs to this company; otherwise 404.
// A missing review and another company's review get the same response.
export async function getReviewOr404(companyId: string, reviewId: string): Promise<Review> {
  const review = await getReview(companyId, reviewId);
  if (!review) {
    notFound();
  }
  return review;
}
