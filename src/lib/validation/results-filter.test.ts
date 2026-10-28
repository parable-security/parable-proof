import { describe, expect, it } from "vitest";

import type { FindingResult } from "../engine/evaluate";

import {
  filterFindings,
  parseResultsFilter,
  policyLabel,
  RESULTS_FILTERS,
  resultLabel,
  userLabel,
} from "./results-filter";

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
