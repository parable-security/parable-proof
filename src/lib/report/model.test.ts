import { describe, expect, it } from "vitest";

import {
  buildReportModel,
  DISCLAIMER,
  NO_EXCEPTIONS_TEXT,
  REPORT_TITLE,
  type ReportFindingInput,
  type ReportInput,
  SCOPE_STATEMENT,
  toLatin1,
} from "./model";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const prohibitedSnapshot = {
  id: "rule-otter",
  appName: "Otter AI",
  appId: "app-otter",
  servicePrincipalId: null,
  approvalStatus: "PROHIBITED",
  approvedForAll: false,
  approvedUsers: [],
  approvedDepartments: [],
  allPermissionsAllowed: false,
  allowedPermissions: [],
  allPermissionsProhibited: true,
  prohibitedPermissions: [],
  notes: null,
  approvedAt: "2026-10-01T12:00:00.000Z",
  matchedBy: "app_id",
};

const conditionalSnapshot = {
  ...prohibitedSnapshot,
  id: "rule-chatgpt",
  appName: "ChatGPT",
  appId: "app-chatgpt",
  approvalStatus: "CONDITIONAL",
  approvedDepartments: ["Marketing"],
  approvedUsers: ["mark@example.com"],
  allPermissionsProhibited: false,
  allowedPermissions: ["Files.Read"],
  prohibitedPermissions: ["Mail.Send"],
  matchedBy: "service_principal_id",
};

function finding(overrides: Partial<ReportFindingInput>): ReportFindingInput {
  return {
    id: "f-1",
    appName: "Otter AI",
    appId: "app-otter",
    userEmail: "sarah@example.com",
    observedPermission: "Files.Read",
    result: "POLICY_EXCEPTION",
    policyRuleSnapshot: prohibitedSnapshot,
    evidenceRowNumber: 4,
    observedAt: new Date("2026-10-18T14:30:00Z"),
    resolutionStatus: "OPEN",
    resolutionNote: null,
    resolvedBy: null,
    resolvedByAccountName: null,
    resolvedAt: null,
    notes: [],
    ...overrides,
  };
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    companyName: "Example Advisors LLC",
    reviewName: "October 2026 AI Policy Check",
    reviewDate: "2026-10-26",
    reviewer: "Jane Doe",
    reportId: "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f",
    finalizedAt: new Date("2026-10-27T18:05:00Z"),
    finalizedByName: "Jane Doe (CCO)",
    evidenceFileName: "evidence.csv",
    evidenceSha256: SHA_A,
    rawExportSha256: SHA_B,
    findings: [finding({})],
    ...overrides,
  };
}

describe("toLatin1", () => {
  it("keeps ASCII and Latin-1 letters", () => {
    expect(toLatin1("Café Résumé ÄÖÜ ñ £ ©")).toBe("Café Résumé ÄÖÜ ñ £ ©");
  });

  it("replaces an emoji with a single ?", () => {
    expect(toLatin1("ChatGPT 🤖")).toBe("ChatGPT ?");
    expect(toLatin1("👩‍💻")).toBe("???");
  });

  it("replaces each CJK character with ?", () => {
    expect(toLatin1("通义千问")).toBe("????");
  });

  it("maps curly single quotes to '", () => {
    expect(toLatin1("‘It’s’")).toBe("'It's'");
  });

  it('maps curly double quotes to "', () => {
    expect(toLatin1("“removed”")).toBe('"removed"');
  });

  it("maps en and em dashes to -", () => {
    expect(toLatin1("Oct 1–Oct 20 — done")).toBe("Oct 1-Oct 20 - done");
  });

  it("maps the ellipsis to ...", () => {
    expect(toLatin1("Investigating…")).toBe("Investigating...");
  });

  it("maps the narrow and thin spaces Intl uses to a space", () => {
    expect(toLatin1("2:30 PM EDT")).toBe("2:30 PM EDT");
  });

  it("keeps newlines and tabs but replaces other control characters", () => {
    expect(toLatin1("a\nb\tc\u0000d\u0085e\u007f")).toBe("a\nb\tc?d?e?");
  });
});

describe("buildReportModel", () => {
  it("fills the header", () => {
    const model = buildReportModel(input());
    expect(model.title).toBe(REPORT_TITLE);
    expect(model.title).toBe("Parable Proof: AI Policy Compliance Check");
    expect(model.header).toEqual({
      company: "Example Advisors LLC",
      reviewName: "October 2026 AI Policy Check",
      reviewDate: "October 26, 2026",
      reviewer: "Jane Doe",
      reportId: "3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f",
      finalizedAt: "Oct 27, 2026, 2:05 PM",
      finalizedBy: "Jane Doe (CCO)",
    });
    expect(model.metadata).toEqual({
      title: REPORT_TITLE,
      author: "Parable Proof",
      creationDate: new Date("2026-10-27T18:05:00Z"),
    });
  });

  it("summarizes unique applications across every result", () => {
    const model = buildReportModel(
      input({
        findings: [
          finding({ id: "1", appName: "Otter AI", appId: "app-otter" }),
          finding({ id: "2", appName: "Otter AI", appId: "app-otter", result: "COMPLIANT" }),
          finding({ id: "3", appName: "Fireflies", appId: "app-ff", result: "REVIEW_REQUIRED" }),
          finding({ id: "4", appName: "ChatGPT", appId: "app-gpt", result: "COMPLIANT" }),
          finding({ id: "5", appName: "Copilot", appId: "app-cp", result: "COMPLIANT" }),
        ],
      }),
    );
    expect(model.summary).toEqual({
      applications: 4,
      compliant: 2,
      exceptions: 1,
      reviewRequired: 1,
      sentence: "4 AI applications reviewed, 2 compliant, 1 policy exception, 1 requires review.",
    });
  });

  it("pluralizes the summary sentence", () => {
    const model = buildReportModel(
      input({
        findings: [
          finding({ id: "1", appId: "a" }),
          finding({ id: "2", appId: "b" }),
          finding({ id: "3", appId: "c", result: "REVIEW_REQUIRED" }),
          finding({ id: "4", appId: "d", result: "REVIEW_REQUIRED" }),
        ],
      }),
    );
    expect(model.summary.sentence).toBe(
      "4 AI applications reviewed, 0 compliant, 2 policy exceptions, 2 require review.",
    );
  });

  it("lists only policy exceptions, by app name then evidence row", () => {
    const model = buildReportModel(
      input({
        findings: [
          finding({ id: "z", appName: "otter AI", evidenceRowNumber: 9 }),
          finding({ id: "r", appName: "Fireflies", result: "REVIEW_REQUIRED" }),
          finding({ id: "c", appName: "Copilot", result: "COMPLIANT" }),
          finding({ id: "b", appName: "ChatGPT", evidenceRowNumber: 2 }),
          finding({ id: "a", appName: "Otter AI", evidenceRowNumber: 3 }),
        ],
      }),
    );
    expect(model.exceptions.map((e) => [e.application, e.evidenceSource])).toEqual([
      ["ChatGPT", "evidence.csv, row 2"],
      ["Otter AI", "evidence.csv, row 3"],
      ["otter AI", "evidence.csv, row 9"],
    ]);
  });

  it("describes an open exception with its policy rule", () => {
    const [exception] = buildReportModel(input()).exceptions;
    expect(exception).toEqual({
      application: "Otter AI",
      applicationId: "app-otter",
      user: "sarah@example.com",
      permission: "Files.Read",
      policyRule: {
        appName: "Otter AI",
        status: "Prohibited",
        approvedUsers: "None",
        allowedPermissions: "None",
        prohibitedPermissions: "All",
        matchedBy: "Application ID",
      },
      evidenceSource: "evidence.csv, row 4",
      observed: "Oct 18, 2026, 10:30 AM",
      status: "Open",
      remediationNote: "None",
      resolvedBy: null,
      recordedAccount: null,
      resolvedAt: null,
      notes: [],
    });
  });

  it("describes a conditional rule's lists", () => {
    const [exception] = buildReportModel(
      input({ findings: [finding({ policyRuleSnapshot: conditionalSnapshot })] }),
    ).exceptions;
    expect(exception.policyRule).toEqual({
      appName: "ChatGPT",
      status: "Conditional",
      approvedUsers: "Marketing, mark@example.com",
      allowedPermissions: "Files.Read",
      prohibitedPermissions: "Mail.Send",
      matchedBy: "Service principal ID",
    });
  });

  it("shows Firm-wide for tenant rows and None for a missing app ID", () => {
    const [exception] = buildReportModel(
      input({ findings: [finding({ userEmail: null, appId: null })] }),
    ).exceptions;
    expect(exception.user).toBe("Firm-wide");
    expect(exception.applicationId).toBe("None");
  });

  it("has no policy rule when there is no snapshot", () => {
    const [exception] = buildReportModel(
      input({ findings: [finding({ policyRuleSnapshot: null })] }),
    ).exceptions;
    expect(exception.policyRule).toBeNull();
  });

  it("includes both resolver names for a resolved exception", () => {
    const [exception] = buildReportModel(
      input({
        findings: [
          finding({
            resolutionStatus: "RESOLVED",
            resolutionNote: "Application access removed by IT on October 20.",
            resolvedBy: "IT Team",
            resolvedByAccountName: "Jane Doe",
            resolvedAt: new Date("2026-10-20T13:00:00Z"),
          }),
        ],
      }),
    ).exceptions;
    expect(exception).toMatchObject({
      status: "Resolved",
      remediationNote: "Application access removed by IT on October 20.",
      resolvedBy: "IT Team",
      recordedAccount: "Jane Doe",
      resolvedAt: "Oct 20, 2026, 9:00 AM",
    });
  });

  it("keeps notes in the order given (oldest first) with author and time", () => {
    const [exception] = buildReportModel(
      input({
        findings: [
          finding({
            notes: [
              { note: "IT investigating.", authorName: "Jane Doe", createdAt: new Date("2026-10-19T12:00:00Z") },
              { note: "Employee contacted.", authorName: "Sam Lee", createdAt: new Date("2026-10-19T15:00:00Z") },
            ],
          }),
        ],
      }),
    ).exceptions;
    expect(exception.notes).toEqual([
      { text: "IT investigating.", author: "Jane Doe", at: "Oct 19, 2026, 8:00 AM" },
      { text: "Employee contacted.", author: "Sam Lee", at: "Oct 19, 2026, 11:00 AM" },
    ]);
  });

  it("has no exceptions when there are none", () => {
    const model = buildReportModel(input({ findings: [finding({ result: "COMPLIANT" })] }));
    expect(model.exceptions).toEqual([]);
    expect(model.noExceptionsText).toBe(NO_EXCEPTIONS_TEXT);
    expect(model.noExceptionsText).toBe("No policy exceptions were found.");
  });

  it("records both SHA-256 values, or Not available for the raw export", () => {
    expect(buildReportModel(input()).integrity).toEqual({
      evidenceFileName: "evidence.csv",
      evidenceSha256: SHA_A,
      rawExportSha256: SHA_B,
    });
    expect(buildReportModel(input({ rawExportSha256: null })).integrity.rawExportSha256).toBe(
      "Not available",
    );
  });

  it("uses the exact scope statement and disclaimer", () => {
    const model = buildReportModel(input());
    expect(model.scopeStatement).toBe(SCOPE_STATEMENT);
    expect(model.scopeStatement).toBe(
      "Parable evaluated AI applications identifiable within the Microsoft evidence supplied for this review. This report does not represent complete discovery of all AI usage across the organization.",
    );
    expect(model.disclaimer).toBe(DISCLAIMER);
    expect(model.disclaimer).toBe(
      "This report is evidence support, not a certification or audit opinion.",
    );
  });

  it("replaces characters Helvetica can't draw (emoji, CJK) everywhere", () => {
    const model = buildReportModel(
      input({
        companyName: "Ünïcode Advisors 🏦",
        findings: [
          finding({
            id: "1",
            appName: "ChatGPT 🤖",
            policyRuleSnapshot: { ...prohibitedSnapshot, appName: "ChatGPT 🤖" },
            notes: [{ note: "Checked ‘today’ — ok…", authorName: "李雷", createdAt: new Date("2026-10-19T12:00:00Z") }],
          }),
          finding({ id: "2", appName: "通义千问", appId: "app-qwen" }),
        ],
      }),
    );
    expect(model.header.company).toBe("Ünïcode Advisors ?");
    expect(model.exceptions.map((e) => e.application)).toEqual(["ChatGPT ?", "????"]);
    expect(model.exceptions[0].policyRule?.appName).toBe("ChatGPT ?");
    expect(model.exceptions[0].notes[0]).toMatchObject({
      text: "Checked 'today' - ok...",
      author: "??",
    });
    const everyString = JSON.stringify(model);
    expect([...everyString].every((char) => char.codePointAt(0)! <= 0xff)).toBe(true);
  });

  it("throws for a malformed snapshot", () => {
    expect(() =>
      buildReportModel(input({ findings: [finding({ policyRuleSnapshot: { approvalStatus: "X" } })] })),
    ).toThrow("Malformed policy rule snapshot");
  });

  it("gives the same model for the same input", () => {
    expect(buildReportModel(input())).toEqual(buildReportModel(input()));
  });
});
