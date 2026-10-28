import { describe, expect, it } from "vitest";

import { reviewNextStep } from "./status-label";

const ID = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

describe("reviewNextStep", () => {
  it.each([
    ["DRAFT", "policy", "Continue"],
    ["RULES_PENDING_APPROVAL", "policy", "Continue"],
    ["RULES_APPROVED", "policy", "Continue"],
    ["EVIDENCE_SUBMITTED", "evidence", "Continue"],
    ["EVIDENCE_VALIDATED", "evidence", "Continue"],
    ["RESULTS_READY", "results", "View Results"],
    ["FINALIZED", "results", "Download Report"],
  ] as const)("%s goes to the %s page (%s)", (status, page, label) => {
    expect(reviewNextStep(ID, status)).toEqual({ href: `/reviews/${ID}/${page}`, label });
  });
});
