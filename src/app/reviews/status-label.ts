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
