import { describe, expect, it } from "vitest";

import type { FindingResult } from "../engine/evaluate";

import {
  filterFindings,
  matchedByLabel,
  parseFindingParam,
  parsePolicyRuleSnapshot,
  parseResultsFilter,
  policyLabel,
  RESULTS_FILTERS,
  resultLabel,
  resultsHref,
  userLabel,
} from "./results-filter";

const REVIEW_ID = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const FINDING_ID = "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f";

describe("parseResultsFilter", () => {
  it.each(RESULTS_FILTERS)("accepts %s", (filter) => {
    expect(parseResultsFilter(filter)).toBe(filter);
  });

  it("defaults to all when missing", () => {
    expect(parseResultsFilter(undefined)).toBe("all");
  });

  it.each(["", "EXCEPTIONS", "exception", " review", "junk", "__proto__", "toString"])(
    "falls back to all for %j",
    (raw) => {
      expect(parseResultsFilter(raw)).toBe("all");
    },
  );

  it("falls back to all for a repeated parameter", () => {
    expect(parseResultsFilter(["exceptions", "review"])).toBe("all");
    expect(parseResultsFilter(["exceptions"])).toBe("all");
  });
});

describe("parseFindingParam", () => {
  it("means no drawer when missing", () => {
    expect(parseFindingParam(undefined)).toEqual({ kind: "none" });
  });

  it("accepts a UUID", () => {
    expect(parseFindingParam(FINDING_ID)).toEqual({ kind: "id", id: FINDING_ID });
  });

  it.each(["", " ", "abc", `${FINDING_ID} `, `${FINDING_ID}x`, "00000000-0000-0000-0000-00000000000g"])(
    "rejects %j",
    (raw) => {
      expect(parseFindingParam(raw)).toEqual({ kind: "invalid" });
    },
  );

  it("rejects a repeated parameter", () => {
    expect(parseFindingParam([FINDING_ID, FINDING_ID])).toEqual({ kind: "invalid" });
    expect(parseFindingParam([FINDING_ID])).toEqual({ kind: "invalid" });
  });
});

describe("resultsHref", () => {
  it("links to all results without a query", () => {
    expect(resultsHref(REVIEW_ID, "all")).toBe(`/reviews/${REVIEW_ID}/results`);
  });

  it("keeps a filter", () => {
    expect(resultsHref(REVIEW_ID, "exceptions")).toBe(
      `/reviews/${REVIEW_ID}/results?filter=exceptions`,
    );
  });

  it("opens a finding and keeps the filter", () => {
    expect(resultsHref(REVIEW_ID, "review", FINDING_ID)).toBe(
      `/reviews/${REVIEW_ID}/results?filter=review&finding=${FINDING_ID}`,
    );
  });

  it("opens a finding with no filter", () => {
    expect(resultsHref(REVIEW_ID, "all", FINDING_ID)).toBe(
      `/reviews/${REVIEW_ID}/results?finding=${FINDING_ID}`,
    );
  });
});

describe("filterFindings", () => {
  const findings: { id: string; result: FindingResult }[] = [
    { id: "a", result: "POLICY_EXCEPTION" },
    { id: "b", result: "REVIEW_REQUIRED" },
    { id: "c", result: "COMPLIANT" },
    { id: "d", result: "POLICY_EXCEPTION" },
  ];
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  it("returns everything for all", () => {
    expect(ids(filterFindings(findings, "all"))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps only exceptions", () => {
    expect(ids(filterFindings(findings, "exceptions"))).toEqual(["a", "d"]);
  });

  it("keeps only review required", () => {
    expect(ids(filterFindings(findings, "review"))).toEqual(["b"]);
  });

  it("keeps only compliant", () => {
    expect(ids(filterFindings(findings, "compliant"))).toEqual(["c"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterFindings([{ result: "COMPLIANT" as const }], "exceptions")).toEqual([]);
  });
});

describe("policyLabel", () => {
  it("says No rule when there is no snapshot", () => {
    expect(policyLabel(null)).toBe("No rule");
    expect(policyLabel(undefined)).toBe("No rule");
  });

  it.each([
    ["APPROVED", "Approved"],
    ["CONDITIONAL", "Conditional"],
    ["PROHIBITED", "Prohibited"],
  ])("labels %s as %s", (approvalStatus, label) => {
    expect(policyLabel({ id: "r1", appName: "ChatGPT", approvalStatus, matchedBy: "app_id" })).toBe(
      label,
    );
  });

  it.each([{}, { approvalStatus: "approved" }, { approvalStatus: 1 }, "APPROVED", []])(
    "throws for a malformed snapshot %j",
    (snapshot) => {
      expect(() => policyLabel(snapshot)).toThrow("Malformed policy rule snapshot");
    },
  );
});

describe("parsePolicyRuleSnapshot", () => {
  const snapshot = {
    id: "r1",
    appName: "ChatGPT",
    appId: "app-1",
    servicePrincipalId: null,
    approvalStatus: "CONDITIONAL",
    approvedForAll: false,
    approvedUsers: ["mark@example.com"],
    approvedDepartments: ["Marketing"],
    allPermissionsAllowed: false,
    allowedPermissions: ["Files.Read"],
    allPermissionsProhibited: false,
    prohibitedPermissions: ["Mail.Send"],
    notes: null,
    approvedAt: "2026-10-20T14:00:00.000Z",
    matchedBy: "app_id",
  };

  it("returns null when there is no snapshot", () => {
    expect(parsePolicyRuleSnapshot(null)).toBeNull();
    expect(parsePolicyRuleSnapshot(undefined)).toBeNull();
  });

  it("returns a valid snapshot unchanged", () => {
    expect(parsePolicyRuleSnapshot(snapshot)).toEqual(snapshot);
  });

  it("drops unknown keys", () => {
    expect(parsePolicyRuleSnapshot({ ...snapshot, extra: 1 })).toEqual(snapshot);
  });

  it.each([
    {},
    "CONDITIONAL",
    [],
    { ...snapshot, approvalStatus: "conditional" },
    { ...snapshot, matchedBy: "name" },
    { ...snapshot, approvedUsers: "mark@example.com" },
    { ...snapshot, approvedForAll: "false" },
    { ...snapshot, approvedAt: undefined },
  ])("throws for a malformed snapshot %j", (value) => {
    expect(() => parsePolicyRuleSnapshot(value)).toThrow("Malformed policy rule snapshot");
  });
});

describe("matchedByLabel", () => {
  it("labels each match kind", () => {
    expect(matchedByLabel).toEqual({
      app_id: "Application ID",
      service_principal_id: "Service principal ID",
      app_name: "Application name only (ID not confirmed)",
    });
  });
});

describe("userLabel", () => {
  it("shows the email for user rows", () => {
    expect(userLabel("sarah@example.com")).toBe("sarah@example.com");
  });

  it("shows Firm-wide for tenant rows", () => {
    expect(userLabel(null)).toBe("Firm-wide");
  });
});

describe("resultLabel", () => {
  it("uses the three spec result names", () => {
    expect(resultLabel).toEqual({
      COMPLIANT: "COMPLIANT",
      POLICY_EXCEPTION: "POLICY EXCEPTION",
      REVIEW_REQUIRED: "REVIEW REQUIRED",
    });
  });
});
