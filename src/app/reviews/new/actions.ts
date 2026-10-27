"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/require-user";
import { createReview } from "@/lib/data/reviews";
import { todayInBusinessTz } from "@/lib/dates";

export type CreateReviewState =
  | {
      fieldErrors: { reviewName?: string[]; reviewer?: string[] };
      values: { reviewName: string; reviewer: string };
    }
  | undefined;

const createReviewSchema = z.object({
  reviewName: z
    .string()
    .trim()
    .min(1, "Enter a review name.")
    .max(200, "Review name must be 200 characters or fewer."),
  reviewer: z
    .string()
    .trim()
    .min(1, "Enter the reviewer's name.")
    .max(200, "Reviewer name must be 200 characters or fewer."),
});

export async function createReviewAction(
  _prevState: CreateReviewState,
  formData: FormData,
): Promise<CreateReviewState> {
  const user = await requireRole("customer_admin");

  // Only these two fields are read. Company, creator, status and date come
  // from the server, never from the form.
  const raw = {
    reviewName: String(formData.get("reviewName") ?? ""),
    reviewer: String(formData.get("reviewer") ?? ""),
  };
  const parsed = createReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: raw };
  }

  const { id } = await createReview(user.companyId, user.userId, {
    ...parsed.data,
    reviewDate: todayInBusinessTz(),
  });

  // Outside any try/catch: redirect() works by throwing.
  redirect(`/reviews/${id}/policy`);
}
