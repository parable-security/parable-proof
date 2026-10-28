import type { ReviewStatus } from "@/lib/data/reviews";

export const reviewStatusLabel: Record<ReviewStatus, string> = {
  DRAFT: "Draft",
  RULES_PENDING_APPROVAL: "Rules pending approval",
  RULES_APPROVED: "Rules approved",
  EVIDENCE_SUBMITTED: "Evidence submitted",
  EVIDENCE_VALIDATED: "Evidence validated",
  RESULTS_READY: "Results ready",
  FINALIZED: "Finalized",
};

type Step = { page: "policy" | "evidence" | "results"; label: string };

// A Record, so a new status doesn't compile until it has a step.
const NEXT_STEP: Record<ReviewStatus, Step> = {
  DRAFT: { page: "policy", label: "Continue" },
  RULES_PENDING_APPROVAL: { page: "policy", label: "Continue" },
  RULES_APPROVED: { page: "policy", label: "Continue" },
  EVIDENCE_SUBMITTED: { page: "evidence", label: "Continue" },
  EVIDENCE_VALIDATED: { page: "evidence", label: "Continue" },
  RESULTS_READY: { page: "results", label: "View Results" },
  FINALIZED: { page: "results", label: "Download Report" },
};

// Where the reviews list sends a review: the page for its current step.
export function reviewNextStep(
  reviewId: string,
  status: ReviewStatus,
): { href: string; label: string } {
  const step = NEXT_STEP[status];
  return { href: `/reviews/${reviewId}/${step.page}`, label: step.label };
}
