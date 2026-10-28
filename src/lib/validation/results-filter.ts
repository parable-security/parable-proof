// Screen 5 (Results) and Screen 6 (Exception Detail drawer): the ?filter= and
// ?finding= query parameters and the display labels. Pure: no database, no Next.js.
import { z } from "zod";

import type { FindingResult, PolicyRuleSnapshot, RuleMatch } from "../engine/evaluate";

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

export type FindingParam = { kind: "none" } | { kind: "id"; id: string } | { kind: "invalid" };

const findingIdSchema = z.uuid();

// The raw ?finding= value is untrusted. Missing means no drawer; anything
// present that isn't exactly one UUID (repeated, empty, malformed) is invalid,
// and the page answers 404.
export function parseFindingParam(raw: string | string[] | undefined): FindingParam {
  if (raw === undefined) return { kind: "none" };
  const parsed = findingIdSchema.safeParse(raw);
  return parsed.success ? { kind: "id", id: parsed.data } : { kind: "invalid" };
}

// The results URL, keeping the current filter; with a finding id it opens the drawer.
export function resultsHref(reviewId: string, filter: ResultsFilter, findingId?: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (findingId) params.set("finding", findingId);
  const query = params.toString();
  return `/reviews/${reviewId}/results${query ? `?${query}` : ""}`;
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

const RULE_MATCHES = ["app_id", "service_principal_id", "app_name"] as const;

const fullSnapshotSchema = z.object({
  id: z.string(),
  appName: z.string(),
  appId: z.string().nullable(),
  servicePrincipalId: z.string().nullable(),
  approvalStatus: z.enum(["APPROVED", "CONDITIONAL", "PROHIBITED"]),
  approvedForAll: z.boolean(),
  approvedUsers: z.array(z.string()),
  approvedDepartments: z.array(z.string()),
  allPermissionsAllowed: z.boolean(),
  allowedPermissions: z.array(z.string()),
  allPermissionsProhibited: z.boolean(),
  prohibitedPermissions: z.array(z.string()),
  notes: z.string().nullable(),
  approvedAt: z.string().nullable(),
  matchedBy: z.enum(RULE_MATCHES),
}) satisfies z.ZodType<PolicyRuleSnapshot>;

// The drawer's Policy rule section, from findings.policy_rule_snapshot.
// null when no rule matched; a malformed snapshot is corrupt data, so it throws.
export function parsePolicyRuleSnapshot(snapshot: unknown): PolicyRuleSnapshot | null {
  if (snapshot === null || snapshot === undefined) return null;
  const parsed = fullSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new Error("Malformed policy rule snapshot");
  }
  return parsed.data;
}

export const matchedByLabel: Record<RuleMatch, string> = {
  app_id: "Application ID",
  service_principal_id: "Service principal ID",
  app_name: "Application name only (ID not confirmed)",
};

// Tenant-wide rows have no user (user_email is null).
export function userLabel(userEmail: string | null): string {
  return userEmail ?? "Firm-wide";
}

export const resultLabel: Record<FindingResult, string> = {
  COMPLIANT: "COMPLIANT",
  POLICY_EXCEPTION: "POLICY EXCEPTION",
  REVIEW_REQUIRED: "REVIEW REQUIRED",
};
