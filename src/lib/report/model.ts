// Screen 7: the compliance report's content. Pure: no database, no storage,
// no clock, no randomness. The report id and finalize time are inputs, so the
// same input always gives the same model. The PDF renderer only draws this.
import { formatReviewDate, formatTimestamp } from "../dates";
import { summarizeFindings, type FindingResult } from "../engine/evaluate";
import {
  approvalStatusLabel,
  describeAllowed,
  describePopulation,
  describeProhibited,
} from "../rule-display";
import { matchedByLabel, parsePolicyRuleSnapshot, userLabel } from "../validation/results-filter";

export const REPORT_TITLE = "Parable Proof: AI Policy Compliance Check";

// Spec Screen 7, word for word.
export const SCOPE_STATEMENT =
  "Parable evaluated AI applications identifiable within the Microsoft evidence supplied for this review. This report does not represent complete discovery of all AI usage across the organization.";

export const DISCLAIMER = "This report is evidence support, not a certification or audit opinion.";

export const NO_EXCEPTIONS_TEXT = "No policy exceptions were found.";

export type ReportFindingInput = {
  id: string;
  appName: string;
  appId: string | null;
  userEmail: string | null;
  observedPermission: string;
  result: FindingResult;
  policyRuleSnapshot: unknown;
  evidenceRowNumber: number;
  observedAt: Date;
  resolutionStatus: "OPEN" | "RESOLVED";
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedByAccountName: string | null;
  resolvedAt: Date | null;
  // Oldest first.
  notes: { note: string; authorName: string; createdAt: Date }[];
};

export type ReportInput = {
  companyName: string;
  reviewName: string;
  // YYYY-MM-DD
  reviewDate: string;
  reviewer: string;
  reportId: string;
  finalizedAt: Date;
  finalizedByName: string;
  evidenceFileName: string;
  evidenceSha256: string;
  rawExportSha256: string | null;
  findings: ReportFindingInput[];
};

export type ReportPolicyRule = {
  appName: string;
  status: string;
  approvedUsers: string;
  allowedPermissions: string;
  prohibitedPermissions: string;
  matchedBy: string;
};

export type ReportException = {
  application: string;
  applicationId: string;
  user: string;
  permission: string;
  policyRule: ReportPolicyRule | null;
  evidenceSource: string;
  observed: string;
  status: "Open" | "Resolved";
  remediationNote: string;
  // Set only when Resolved.
  resolvedBy: string | null;
  recordedAccount: string | null;
  resolvedAt: string | null;
  notes: { text: string; author: string; at: string }[];
};

export type ReportModel = {
  title: string;
  header: {
    company: string;
    reviewName: string;
    reviewDate: string;
    reviewer: string;
    reportId: string;
    finalizedAt: string;
    finalizedBy: string;
  };
  metadata: { title: string; author: string; creationDate: Date };
  summary: {
    applications: number;
    compliant: number;
    exceptions: number;
    reviewRequired: number;
    sentence: string;
  };
  exceptions: ReportException[];
  noExceptionsText: string;
  integrity: { evidenceFileName: string; evidenceSha256: string; rawExportSha256: string };
  scopeStatement: string;
  disclaimer: string;
};

// Typographic characters Word and Mac keyboards produce, mapped to ASCII. The
// narrow and thin spaces come from Intl date formatting ("2:30 PM").
const TYPOGRAPHIC: Readonly<Record<string, string>> = {
  " ": " ",
  " ": " ",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
};

// The PDF uses the built-in Helvetica, which can't draw characters outside
// Latin-1. Each such code point (an emoji counts once) becomes "?", so text is
// never dropped silently. Control characters other than tab and newline too.
export function toLatin1(value: string): string {
  let out = "";
  for (const char of value) {
    const mapped = TYPOGRAPHIC[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = char.codePointAt(0)!;
    const printable =
      char === "\n" || char === "\t" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    out += printable ? char : "?";
  }
  return out;
}

function timestamp(instant: Date): string {
  return toLatin1(formatTimestamp(instant));
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

// Code-unit order, not localeCompare: the same on every machine.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function policyRuleOf(snapshot: unknown): ReportPolicyRule | null {
  const rule = parsePolicyRuleSnapshot(snapshot);
  if (!rule) return null;
  return {
    appName: toLatin1(rule.appName),
    status: approvalStatusLabel[rule.approvalStatus],
    approvedUsers: toLatin1(describePopulation(rule)),
    allowedPermissions: toLatin1(describeAllowed(rule)),
    prohibitedPermissions: toLatin1(describeProhibited(rule)),
    matchedBy: matchedByLabel[rule.matchedBy],
  };
}

function exceptionOf(finding: ReportFindingInput, evidenceFileName: string): ReportException {
  const resolved = finding.resolutionStatus === "RESOLVED";
  return {
    application: toLatin1(finding.appName),
    applicationId: toLatin1(finding.appId ?? "None"),
    user: toLatin1(userLabel(finding.userEmail)),
    permission: toLatin1(finding.observedPermission),
    policyRule: policyRuleOf(finding.policyRuleSnapshot),
    evidenceSource: toLatin1(
      `${evidenceFileName}, row ${finding.evidenceRowNumber.toLocaleString("en-US")}`,
    ),
    observed: timestamp(finding.observedAt),
    status: resolved ? "Resolved" : "Open",
    remediationNote: toLatin1(resolved ? (finding.resolutionNote ?? "") : "None"),
    resolvedBy: resolved ? toLatin1(finding.resolvedBy ?? "") : null,
    recordedAccount: resolved ? toLatin1(finding.resolvedByAccountName ?? "") : null,
    resolvedAt: resolved && finding.resolvedAt ? timestamp(finding.resolvedAt) : null,
    notes: finding.notes.map((note) => ({
      text: toLatin1(note.note),
      author: toLatin1(note.authorName),
      at: timestamp(note.createdAt),
    })),
  };
}

export function buildReportModel(input: ReportInput): ReportModel {
  const counts = summarizeFindings(input.findings);

  // Part B: the findings section lists POLICY_EXCEPTION findings only.
  const exceptions = input.findings
    .filter((finding) => finding.result === "POLICY_EXCEPTION")
    .sort(
      (a, b) =>
        compareStrings(a.appName.toLowerCase(), b.appName.toLowerCase()) ||
        a.evidenceRowNumber - b.evidenceRowNumber ||
        compareStrings(a.id, b.id),
    )
    .map((finding) => exceptionOf(finding, input.evidenceFileName));

  return {
    title: REPORT_TITLE,
    header: {
      company: toLatin1(input.companyName),
      reviewName: toLatin1(input.reviewName),
      reviewDate: toLatin1(formatReviewDate(input.reviewDate)),
      reviewer: toLatin1(input.reviewer),
      reportId: input.reportId,
      finalizedAt: timestamp(input.finalizedAt),
      finalizedBy: toLatin1(input.finalizedByName),
    },
    metadata: { title: REPORT_TITLE, author: "Parable Proof", creationDate: input.finalizedAt },
    summary: {
      ...counts,
      sentence:
        `${plural(counts.applications, "AI application", "AI applications")} reviewed, ` +
        `${counts.compliant.toLocaleString("en-US")} compliant, ` +
        `${plural(counts.exceptions, "policy exception", "policy exceptions")}, ` +
        `${plural(counts.reviewRequired, "requires review", "require review")}.`,
    },
    exceptions,
    noExceptionsText: NO_EXCEPTIONS_TEXT,
    integrity: {
      evidenceFileName: toLatin1(input.evidenceFileName),
      evidenceSha256: input.evidenceSha256,
      rawExportSha256: input.rawExportSha256 ?? "Not available",
    },
    scopeStatement: SCOPE_STATEMENT,
    disclaimer: DISCLAIMER,
  };
}
