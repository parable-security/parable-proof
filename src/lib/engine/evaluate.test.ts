import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECK_RESULT,
  DEPARTMENT_NOT_CHECKED_NOTE,
  evaluateEvidence,
  REASONS,
  summarizeFindings,
  type CatalogEntry,
  type EngineInput,
  type EngineRule,
  type EvidenceRow,
  type FindingInput,
} from "./evaluate";

// Fake ids and example.com addresses only.
const RULE_ID = "10000000-0000-4000-8000-000000000001";
const RULE_ID_2 = "10000000-0000-4000-8000-000000000002";
const CATALOG_ID = "20000000-0000-4000-8000-000000000001";
const CATALOG_ID_2 = "20000000-0000-4000-8000-000000000002";
const APP_ID = "a1b2c3d4-0000-4000-8000-000000000003";
const OTHER_APP_ID = "a1b2c3d4-0000-4000-8000-0000000000ff";
const SP_ID = "s1b2c3d4-0000-4000-8000-000000000003";

let evidenceCounter = 0;

function rule(overrides: Partial<EngineRule> = {}): EngineRule {
  return {
    id: RULE_ID,
    appName: "ChatGPT Enterprise",
    appId: APP_ID,
    servicePrincipalId: null,
    approvalStatus: "APPROVED",
    approvedForAll: true,
    approvedUsers: [],
    approvedDepartments: [],
    allPermissionsAllowed: false,
    allowedPermissions: [],
    allPermissionsProhibited: false,
    prohibitedPermissions: [],
    notes: null,
    approvedAt: new Date("2026-10-20T15:00:00.000Z"),
    ...overrides,
  };
}

function catalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: CATALOG_ID,
    appName: "ChatGPT Enterprise",
    appId: APP_ID,
    classification: "AI",
    ...overrides,
  };
}

function row(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  evidenceCounter += 1;
  return {
    id: `30000000-0000-4000-8000-${String(evidenceCounter).padStart(12, "0")}`,
    rowNumber: evidenceCounter + 1,
    userEmail: "sarah@example.com",
    appName: "ChatGPT Enterprise",
    appId: APP_ID,
    servicePrincipalId: null,
    permissionScope: "Files.Read",
    consentType: "User",
    resourceName: "Microsoft Graph",
    observedAt: new Date("2026-10-18T14:30:00.000Z"),
    assignmentScope: "USER",
    userDepartment: "Marketing",
    ...overrides,
  };
}

const TENANT: Partial<EvidenceRow> = {
  userEmail: null,
  userDepartment: null,
  consentType: "Tenant",
  assignmentScope: "TENANT",
};

function evaluate(input: Partial<EngineInput>): FindingInput[] {
  return evaluateEvidence({ rules: [], catalog: [], evidence: [], ...input });
}

// One rule, one row: the single finding.
function decide(ruleOverrides: Partial<EngineRule> | null, rowOverrides: Partial<EvidenceRow> = {}) {
  const findings = evaluate({
    rules: ruleOverrides ? [rule(ruleOverrides)] : [],
    evidence: [row(rowOverrides)],
  });
  expect(findings).toHaveLength(1);
  return findings[0];
}

const DEPARTMENT_RULE: Partial<EngineRule> = {
  approvalStatus: "CONDITIONAL",
  approvedForAll: false,
  approvedDepartments: ["Marketing", "Research"],
  allPermissionsAllowed: true,
};

describe("matching a rule", () => {
  it("matches by app_id, ignoring case and whitespace", () => {
    const finding = decide({ appId: ` ${APP_ID.toUpperCase()} ` });
    expect(finding).toMatchObject({ policyRuleId: RULE_ID, checkType: "compliant" });
    expect(finding.policyRuleSnapshot?.matchedBy).toBe("app_id");
  });

  it("matches by service principal when the app_id does not match", () => {
    const finding = decide(
      { appId: OTHER_APP_ID, servicePrincipalId: SP_ID.toUpperCase() },
      { servicePrincipalId: SP_ID },
    );
    expect(finding).toMatchObject({ policyRuleId: RULE_ID, checkType: "compliant" });
    expect(finding.policyRuleSnapshot?.matchedBy).toBe("service_principal_id");

    const noAppId = decide({ appId: null, servicePrincipalId: SP_ID }, { servicePrincipalId: SP_ID });
    expect(noAppId.policyRuleSnapshot?.matchedBy).toBe("service_principal_id");
  });

  it("prefers the app_id match over a service principal match", () => {
    const [finding] = evaluate({
      rules: [
        rule({ id: RULE_ID_2, appId: OTHER_APP_ID, servicePrincipalId: SP_ID, approvalStatus: "PROHIBITED", approvedForAll: false, allPermissionsProhibited: true }),
        rule({ id: RULE_ID, appId: APP_ID }),
      ],
      evidence: [row({ servicePrincipalId: SP_ID })],
    });
    expect(finding).toMatchObject({ policyRuleId: RULE_ID, checkType: "compliant" });
  });

  it("matches a rule with no IDs by name only, and asks for review", () => {
    const finding = decide(
      { appId: null, servicePrincipalId: null, appName: "  chatgpt ENTERPRISE " },
      { appId: OTHER_APP_ID },
    );
    expect(finding).toMatchObject({
      policyRuleId: RULE_ID,
      checkType: "name_match_only",
      result: "REVIEW_REQUIRED",
      reason: REASONS.name_match_only,
    });
    expect(finding.policyRuleSnapshot?.matchedBy).toBe("app_name");
  });

  it("never gives a confident verdict from a name match, even for a prohibited rule", () => {
    const finding = decide(
      { appId: null, approvalStatus: "PROHIBITED", approvedForAll: false, allPermissionsProhibited: true },
      { appId: OTHER_APP_ID },
    );
    expect(finding).toMatchObject({ checkType: "name_match_only", result: "REVIEW_REQUIRED" });
  });

  it("does not match by name when the rule has a different ID", () => {
    const finding = decide({ appId: OTHER_APP_ID });
    expect(finding).toMatchObject({
      checkType: "unclassified_app",
      policyRuleId: null,
      policyRuleSnapshot: null,
    });

    const withSpOnly = decide({ appId: null, servicePrincipalId: SP_ID }, { servicePrincipalId: null });
    expect(withSpOnly.checkType).toBe("unclassified_app");
  });
});

describe("no rule: the app catalog", () => {
  it("gives unknown_ai_app for an AI app, by app_id or by name", () => {
    const [byId] = evaluate({ catalog: [catalogEntry({ appId: APP_ID.toUpperCase() })], evidence: [row()] });
    expect(byId).toMatchObject({
      checkType: "unknown_ai_app",
      result: "REVIEW_REQUIRED",
      reason: REASONS.unknown_ai_app,
      policyRuleId: null,
      policyRuleSnapshot: null,
    });

    const [byName] = evaluate({
      catalog: [catalogEntry({ appId: null, appName: "chatgpt enterprise" })],
      evidence: [row()],
    });
    expect(byName.checkType).toBe("unknown_ai_app");
  });

  it("excludes NOT_AI apps entirely", () => {
    const findings = evaluate({
      catalog: [catalogEntry({ classification: "NOT_AI" })],
      evidence: [row(), row({ appId: OTHER_APP_ID, appName: "Fireflies" })],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ appName: "Fireflies", checkType: "unclassified_app" });
  });

  it("does not exclude by name a NOT_AI entry with a different app_id", () => {
    const [finding] = evaluate({
      catalog: [catalogEntry({ appId: OTHER_APP_ID, classification: "NOT_AI" })],
      evidence: [row()],
    });
    expect(finding.checkType).toBe("unclassified_app");
  });

  it("gives unclassified_app for an app in neither the policy nor the catalog", () => {
    const finding = decide(null);
    expect(finding).toMatchObject({
      checkType: "unclassified_app",
      result: "REVIEW_REQUIRED",
      reason: REASONS.unclassified_app,
      policyRuleId: null,
      policyRuleSnapshot: null,
    });
  });

  it("evaluates a matching rule even when the catalog says NOT_AI", () => {
    const [finding] = evaluate({
      rules: [rule()],
      catalog: [catalogEntry({ classification: "NOT_AI" })],
      evidence: [row()],
    });
    expect(finding.checkType).toBe("compliant");
  });
});

describe("check order", () => {
  it("flags a prohibited app before anything else, including tenant-wide rows", () => {
    const prohibited: Partial<EngineRule> = {
      approvalStatus: "PROHIBITED",
      approvedForAll: false,
      allPermissionsProhibited: true,
    };
    expect(decide(prohibited)).toMatchObject({
      checkType: "prohibited_app",
      result: "POLICY_EXCEPTION",
      reason: REASONS.prohibited_app,
    });
    expect(decide(prohibited, TENANT).checkType).toBe("prohibited_app");
  });

  it("checks the population before the permission", () => {
    const finding = decide(
      { approvedForAll: false, approvedUsers: ["james@example.com"], prohibitedPermissions: ["Files.Read"] },
      { userDepartment: null },
    );
    expect(finding).toMatchObject({
      checkType: "unauthorized_user",
      result: "POLICY_EXCEPTION",
      reason: REASONS.unauthorized_user,
    });
  });

  it("flags a prohibited permission on an approved rule", () => {
    expect(decide({ prohibitedPermissions: ["Files.Read"] })).toMatchObject({
      checkType: "prohibited_permission",
      result: "POLICY_EXCEPTION",
      reason: REASONS.prohibited_permission,
    });
  });

  it("flags every permission when all permissions are prohibited", () => {
    expect(decide({ allPermissionsProhibited: true }).checkType).toBe("prohibited_permission");
  });

  it("finds an approved rule compliant even for a permission not on an allowed list", () => {
    expect(decide({ allowedPermissions: ["Mail.Read"] })).toMatchObject({
      checkType: "compliant",
      result: "COMPLIANT",
      reason: REASONS.compliant,
    });
  });

  it("finds a conditional rule compliant only for allowed permissions", () => {
    const conditional: Partial<EngineRule> = { approvalStatus: "CONDITIONAL", allowedPermissions: ["Files.Read"] };
    expect(decide(conditional).checkType).toBe("compliant");
    expect(decide(conditional, { permissionScope: "Mail.Read" })).toMatchObject({
      checkType: "unlisted_permission",
      result: "REVIEW_REQUIRED",
      reason: REASONS.unlisted_permission,
    });
    expect(
      decide({ approvalStatus: "CONDITIONAL", allPermissionsAllowed: true }, { permissionScope: "Mail.Read" })
        .checkType,
    ).toBe("compliant");
  });

  it("treats all-allowed with a prohibited list as everything except those", () => {
    const allExcept: Partial<EngineRule> = {
      approvalStatus: "CONDITIONAL",
      allPermissionsAllowed: true,
      prohibitedPermissions: ["Files.Read"],
    };
    expect(decide(allExcept).checkType).toBe("prohibited_permission");
    expect(decide(allExcept, { permissionScope: "Mail.Read" }).checkType).toBe("compliant");
  });
});

describe("population", () => {
  it("skips the population check for tenant-wide rows", () => {
    const finding = decide(DEPARTMENT_RULE, TENANT);
    expect(finding).toMatchObject({
      checkType: "compliant",
      reason: REASONS.compliantTenant,
      userEmail: null,
    });
  });

  it("passes for approved-for-all, a listed email, or a listed department", () => {
    expect(decide({ approvedForAll: true }, { userDepartment: null }).checkType).toBe("compliant");
    expect(
      decide({ approvedForAll: false, approvedUsers: ["sarah@example.com"] }, { userDepartment: "Finance" })
        .checkType,
    ).toBe("compliant");
    expect(decide(DEPARTMENT_RULE, { userDepartment: "Research" }).checkType).toBe("compliant");
  });

  it("fails for a department that is present but not listed", () => {
    expect(decide(DEPARTMENT_RULE, { userDepartment: "Finance" }).checkType).toBe("unauthorized_user");
  });

  it("skips the department check when the department is missing (department-only rule)", () => {
    for (const userDepartment of [null, "", "   "]) {
      const finding = decide(DEPARTMENT_RULE, { userDepartment });
      expect(finding).toMatchObject({
        checkType: "compliant",
        reason: REASONS.compliant + DEPARTMENT_NOT_CHECKED_NOTE,
      });
    }
  });

  it("skips the department check when the department is missing (users and departments)", () => {
    const both: Partial<EngineRule> = {
      ...DEPARTMENT_RULE,
      approvedUsers: ["james@example.com"],
      allPermissionsAllowed: false,
      prohibitedPermissions: ["Files.Read"],
    };
    const finding = decide(both, { userDepartment: null });
    expect(finding).toMatchObject({
      checkType: "prohibited_permission",
      reason: REASONS.prohibited_permission + DEPARTMENT_NOT_CHECKED_NOTE,
    });
    expect(decide(both, { userDepartment: null, permissionScope: "Mail.Read" })).toMatchObject({
      checkType: "unlisted_permission",
      reason: REASONS.unlisted_permission + DEPARTMENT_NOT_CHECKED_NOTE,
    });
  });

  it("still enforces an email-only list when the department is missing", () => {
    const finding = decide(
      { approvedForAll: false, approvedUsers: ["james@example.com"] },
      { userDepartment: null },
    );
    expect(finding).toMatchObject({ checkType: "unauthorized_user", reason: REASONS.unauthorized_user });
  });

  it("does not add the note when the department passed or was not needed", () => {
    expect(decide(DEPARTMENT_RULE).reason).toBe(REASONS.compliant);
    expect(decide({ approvedForAll: true }, { userDepartment: null }).reason).toBe(REASONS.compliant);
  });
});

describe("case-insensitive matching", () => {
  it("matches emails, departments and permissions regardless of case", () => {
    expect(
      decide({ approvedForAll: false, approvedUsers: ["sarah@example.com"] }, { userEmail: "Sarah@Example.COM", userDepartment: null })
        .checkType,
    ).toBe("compliant");
    expect(decide(DEPARTMENT_RULE, { userDepartment: "marketing " }).checkType).toBe("compliant");
    expect(decide({ prohibitedPermissions: [" files.read "] }).checkType).toBe("prohibited_permission");
    expect(
      decide({ approvalStatus: "CONDITIONAL", allowedPermissions: ["files.read"] }, { permissionScope: "FILES.READ" })
        .checkType,
    ).toBe("compliant");
  });

  it("checks each scope of a multi-scope permission", () => {
    const multi = { permissionScope: "Files.Read  Mail.Read" };
    expect(decide({ prohibitedPermissions: ["Mail.Read"] }, multi).checkType).toBe("prohibited_permission");
    expect(
      decide({ approvalStatus: "CONDITIONAL", allowedPermissions: ["Files.Read"] }, multi).checkType,
    ).toBe("unlisted_permission");
    const finding = decide(
      { approvalStatus: "CONDITIONAL", allowedPermissions: ["Files.Read", "Mail.Read"] },
      multi,
    );
    expect(finding).toMatchObject({ checkType: "compliant", observedPermission: "Files.Read  Mail.Read" });
  });
});

describe("finding shape", () => {
  it("carries the rule id and a full snapshot of the rule", () => {
    const input = rule({ approvalStatus: "CONDITIONAL", allowedPermissions: ["Files.Read"], notes: "No client files" });
    const [finding] = evaluate({ rules: [input], evidence: [row()] });
    expect(finding.policyRuleSnapshot).toEqual({
      id: RULE_ID,
      appName: "ChatGPT Enterprise",
      appId: APP_ID,
      servicePrincipalId: null,
      approvalStatus: "CONDITIONAL",
      approvedForAll: true,
      approvedUsers: [],
      approvedDepartments: [],
      allPermissionsAllowed: false,
      allowedPermissions: ["Files.Read"],
      allPermissionsProhibited: false,
      prohibitedPermissions: [],
      notes: "No client files",
      approvedAt: "2026-10-20T15:00:00.000Z",
      matchedBy: "app_id",
    });
    input.allowedPermissions.push("Mail.Read");
    expect(finding.policyRuleSnapshot?.allowedPermissions).toEqual(["Files.Read"]);
  });

  it("copies the evidence values as observed", () => {
    const evidence = row({
      userEmail: "Sarah@Example.com",
      appName: "ChatGPT Enterprise ",
      servicePrincipalId: SP_ID,
      permissionScope: "Files.Read",
    });
    const [finding] = evaluate({ rules: [rule()], evidence: [evidence] });
    expect(finding).toMatchObject({
      evidenceRecordId: evidence.id,
      appName: "ChatGPT Enterprise ",
      appId: APP_ID,
      servicePrincipalId: SP_ID,
      userEmail: "Sarah@Example.com",
      observedPermission: "Files.Read",
    });
  });

  it("always pairs check type and result as the database requires", () => {
    const findings = evaluate(mixedInput());
    expect(findings.length).toBeGreaterThan(5);
    for (const finding of findings) {
      expect(finding.result).toBe(CHECK_RESULT[finding.checkType]);
      expect(finding.policyRuleId === null).toBe(finding.policyRuleSnapshot === null);
    }
  });

  it("sorts findings by evidence row number", () => {
    const rows = [row({ rowNumber: 9 }), row({ rowNumber: 2 }), row({ rowNumber: 5 })];
    const findings = evaluate({ rules: [rule()], evidence: rows });
    expect(findings.map((f) => f.evidenceRecordId)).toEqual([rows[1].id, rows[2].id, rows[0].id]);
  });
});

// A review with every kind of outcome.
function mixedInput(): EngineInput {
  return {
    rules: [
      rule({ id: RULE_ID, prohibitedPermissions: ["Mail.Send"] }),
      rule({
        id: RULE_ID_2,
        appName: "Otter AI",
        appId: "otter-id",
        approvalStatus: "PROHIBITED",
        approvedForAll: false,
        allPermissionsProhibited: true,
      }),
      rule({
        id: "10000000-0000-4000-8000-000000000003",
        appName: "Notion AI",
        appId: null,
        approvalStatus: "CONDITIONAL",
        allowedPermissions: ["Files.Read"],
      }),
      rule({
        id: "10000000-0000-4000-8000-000000000004",
        appName: "Copilot",
        appId: "copilot-id",
        approvalStatus: "CONDITIONAL",
        approvedForAll: false,
        approvedDepartments: ["Research"],
        allowedPermissions: ["Files.Read"],
      }),
    ],
    catalog: [
      catalogEntry({ id: CATALOG_ID, appName: "Fireflies", appId: "fireflies-id", classification: "AI" }),
      catalogEntry({ id: CATALOG_ID_2, appName: "Zoom", appId: "zoom-id", classification: "NOT_AI" }),
    ],
    evidence: [
      row({ rowNumber: 2 }),
      row({ rowNumber: 3, permissionScope: "Mail.Send" }),
      row({ rowNumber: 4, appName: "Otter AI", appId: "otter-id" }),
      row({ rowNumber: 5, appName: "Notion AI", appId: "notion-id" }),
      row({ rowNumber: 6, appName: "Copilot", appId: "copilot-id", userDepartment: "Finance" }),
      row({ rowNumber: 7, appName: "Copilot", appId: "copilot-id", permissionScope: "Mail.Read", userDepartment: "Research" }),
      row({ rowNumber: 8, appName: "Copilot", appId: "copilot-id", ...TENANT }),
      row({ rowNumber: 9, appName: "Fireflies", appId: "fireflies-id" }),
      row({ rowNumber: 10, appName: "Zoom", appId: "zoom-id" }),
      row({ rowNumber: 11, appName: "Mystery App", appId: "mystery-id" }),
    ],
  };
}

describe("determinism", () => {
  it("covers every check type in the mixed review", () => {
    const checkTypes = evaluate(mixedInput()).map((f) => f.checkType);
    expect(checkTypes).toEqual([
      "compliant",
      "prohibited_permission",
      "prohibited_app",
      "name_match_only",
      "unauthorized_user",
      "unlisted_permission",
      "compliant",
      "unknown_ai_app",
      "unclassified_app",
    ]);
  });

  it("gives identical output for the same input", () => {
    const input = mixedInput();
    expect(evaluateEvidence(input)).toEqual(evaluateEvidence(input));
  });

  it("gives identical output whatever the input order", () => {
    const input = mixedInput();
    const reversed: EngineInput = {
      rules: [...input.rules].reverse(),
      catalog: [...input.catalog].reverse(),
      evidence: [...input.evidence].reverse(),
    };
    expect(evaluateEvidence(reversed)).toEqual(evaluateEvidence(input));
  });

  it("picks the same rule for duplicate keys whatever the order", () => {
    const a = rule({ id: RULE_ID });
    const b = rule({ id: RULE_ID_2, approvalStatus: "PROHIBITED", approvedForAll: false, allPermissionsProhibited: true });
    const evidence = [row()];
    const first = evaluate({ rules: [a, b], evidence });
    const second = evaluate({ rules: [b, a], evidence });
    expect(first).toEqual(second);
    expect(first[0].policyRuleId).toBe(RULE_ID);
  });

  it("does not mutate its input", () => {
    const input = mixedInput();
    const copy = structuredClone(input);
    evaluateEvidence(input);
    expect(input).toEqual(copy);
  });
});

describe("summarizeFindings", () => {
  it("counts unique applications by their worst result", () => {
    const summary = summarizeFindings(evaluate(mixedInput()));
    // ChatGPT (exception), Otter AI (exception), Notion AI (review),
    // Copilot (exception), Fireflies (review), Mystery App (review). Zoom is excluded.
    expect(summary).toEqual({ applications: 6, compliant: 0, exceptions: 3, reviewRequired: 3 });
  });

  it("ranks exception over review over compliant within one app", () => {
    const app = { appId: "app-1", appName: "App" };
    expect(
      summarizeFindings([
        { ...app, result: "COMPLIANT" },
        { ...app, result: "REVIEW_REQUIRED" },
        { ...app, result: "COMPLIANT" },
      ]),
    ).toEqual({ applications: 1, compliant: 0, exceptions: 0, reviewRequired: 1 });
    expect(
      summarizeFindings([
        { ...app, result: "REVIEW_REQUIRED" },
        { ...app, result: "POLICY_EXCEPTION" },
      ]),
    ).toEqual({ applications: 1, compliant: 0, exceptions: 1, reviewRequired: 0 });
    expect(summarizeFindings([{ ...app, result: "COMPLIANT" }, { ...app, appId: " APP-1 ", result: "COMPLIANT" }]))
      .toEqual({ applications: 1, compliant: 1, exceptions: 0, reviewRequired: 0 });
  });

  it("treats the same name with different app IDs as different apps", () => {
    expect(
      summarizeFindings([
        { appId: "app-1", appName: "ChatGPT", result: "COMPLIANT" },
        { appId: "app-2", appName: "ChatGPT", result: "POLICY_EXCEPTION" },
        { appId: null, appName: "chatgpt", result: "REVIEW_REQUIRED" },
      ]),
    ).toEqual({ applications: 3, compliant: 1, exceptions: 1, reviewRequired: 1 });
  });

  it("returns zeros for no findings", () => {
    expect(summarizeFindings([])).toEqual({ applications: 0, compliant: 0, exceptions: 0, reviewRequired: 0 });
  });
});

describe("purity", () => {
  it("imports nothing and never reads the clock or randomness", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/engine/evaluate.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("new Date(");
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("crypto");
  });
});
