"use server";

import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { runPolicyCheck, type RunPolicyCheckResult } from "@/lib/data/findings";

// The bound reviewId comes from the client and is untrusted: runPolicyCheck
// re-checks it against the signed-in user's company under a row lock.

export type RunCheckState = { error?: string } | undefined;

const ERROR_MESSAGES: Record<
  Exclude<Extract<RunPolicyCheckResult, { ok: false }>["error"], "NOT_FOUND">,
  string
> = {
  FINALIZED: "This review is finalized. Its results can't be changed.",
  WRONG_STATUS: "Evidence for this review hasn't been validated yet.",
  NO_RULES: "Add at least one policy rule before running the check.",
  RULES_NOT_APPROVED:
    "Some policy rules are waiting for approval. Approve your policy rules before running the check.",
  HAS_ACTIVITY: "Findings already have notes or resolutions. Start a new review to check again.",
};

export async function runPolicyCheckAction(reviewId: string): Promise<RunCheckState> {
  const user = await requireRole("customer_admin");

  const result = await runPolicyCheck(user.companyId, reviewId);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    return { error: ERROR_MESSAGES[result.error] };
  }
  redirect(`/reviews/${reviewId}/results`);
}
