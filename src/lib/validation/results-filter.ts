// Screen 5 (Results): the ?filter= query parameter and the table's display
// labels. Pure: no database, no Next.js.
import { z } from "zod";

import type { FindingResult } from "../engine/evaluate";

export const RESULTS_FILTERS = ["all", "exceptions", "review", "compliant"] as const;
export type ResultsFilter = (typeof RESULTS_FILTERS)[number];

const resultsFilterSchema = z.enum(RESULTS_FILTERS);

export const resultsFilterLabel: Record<ResultsFilter, string> = {
  all: "All",
  exceptions: "Exceptions",
  review: "Review Required",
  compliant: "Compliant",
};

const FILTER_RESULT: Record<Exclude<ResultsFilter, "all">, FindingResult> = {
  exceptions: "POLICY_EXCEPTION",
  review: "REVIEW_REQUIRED",
  compliant: "COMPLIANT",
};

// The raw query value is untrusted. Anything that isn't exactly one allowed
// value (missing, repeated, unknown) shows all findings.
export function parseResultsFilter(raw: string | string[] | undefined): ResultsFilter {
  const parsed = resultsFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : "all";
}

export function filterFindings<T extends { result: FindingResult }>(
  findings: T[],
  filter: ResultsFilter,
): T[] {
  if (filter === "all") return findings;
  const result = FILTER_RESULT[filter];
  return findings.filter((finding) => finding.result === result);
}

const snapshotSchema = z.object({
  approvalStatus: z.enum(["APPROVED", "CONDITIONAL", "PROHIBITED"]),
});

const APPROVAL_LABEL = {
  APPROVED: "Approved",
  CONDITIONAL: "Conditional",
  PROHIBITED: "Prohibited",
} as const;

// The Policy column, from findings.policy_rule_snapshot (frozen at check time).
// A malformed snapshot is corrupt data, so it throws rather than guess.
export function policyLabel(snapshot: unknown): string {
  if (snapshot === null || snapshot === undefined) return "No rule";
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new Error("Malformed policy rule snapshot");
  }
  return APPROVAL_LABEL[parsed.data.approvalStatus];
}

// Tenant-wide rows have no user (user_email is null).
export function userLabel(userEmail: string | null): string {
  return userEmail ?? "Firm-wide";
}

export const resultLabel: Record<FindingResult, string> = {
  COMPLIANT: "COMPLIANT",
  POLICY_EXCEPTION: "POLICY EXCEPTION",
  REVIEW_REQUIRED: "REVIEW REQUIRED",
};
