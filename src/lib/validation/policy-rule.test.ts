import { describe, expect, it } from "vitest";

import {
  parseEmailList,
  parsePolicyRuleForm,
  splitList,
  type ParseRuleResult,
  type RuleFormFields,
} from "./policy-rule";

const base: RuleFormFields = {
  appName: "ChatGPT Enterprise",
  appId: "00000000-0000-0000-0000-000000000001",
  servicePrincipalId: "",
  approvalStatus: "CONDITIONAL",
  approvedDepartments: "Marketing",
  notes: "",
};

function parse(overrides: RuleFormFields): ParseRuleResult {
  return parsePolicyRuleForm({ ...base, ...overrides });
}

function expectOk(result: ParseRuleResult) {
  if (!result.success) {
    throw new Error(`expected success, got ${JSON.stringify(result.fieldErrors)}`);
  }
  return result.data;
}

function expectErrors(result: ParseRuleResult) {
  if (result.success) {
    throw new Error("expected errors, got success");
  }
  return result.fieldErrors;
}

describe("splitList", () => {
  it("splits on commas, trims and drops empty items", () => {
    expect(splitList("a, b,,c ")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for empty or blank input", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList(" , , ")).toEqual([]);
  });

  it("removes duplicates ignoring case and keeps the first spelling", () => {
    expect(splitList("Files.Read, files.read, Mail.Read")).toEqual(["Files.Read", "Mail.Read"]);
  });
});

describe("parseEmailList", () => {
  it("lowercases and dedupes emails", () => {
    expect(parseEmailList("Sarah@Firm.com, sarah@firm.com")).toEqual({
      emails: ["sarah@firm.com"],
      invalid: [],
    });
  });

  it("reports invalid entries", () => {
    expect(parseEmailList("bad, ok@firm.com")).toEqual({
      emails: ["ok@firm.com"],
      invalid: ["bad"],
    });
  });
});

describe("parsePolicyRuleForm: population", () => {
  it("rejects an APPROVED rule with no population", () => {
    const errors = expectErrors(parse({ approvalStatus: "APPROVED", approvedDepartments: "" }));
    expect(errors.population).toBeDefined();
  });

  it("accepts CONDITIONAL with departments only", () => {
    const data = expectOk(parse({ approvedDepartments: "Marketing, Research, marketing" }));
    expect(data.approvedDepartments).toEqual(["Marketing", "Research"]);
    expect(data.approvedUsers).toEqual([]);
  });

  it("accepts APPROVED with users only and normalizes the emails", () => {
    const data = expectOk(
      parse({
        approvalStatus: "APPROVED",
        approvedDepartments: "",
        approvedUsers: " Mark@Firm.com ,mark@firm.com, james@firm.com",
      }),
    );
    expect(data.approvedUsers).toEqual(["mark@firm.com", "james@firm.com"]);
  });

  it("rejects invalid emails in approved users", () => {
    const errors = expectErrors(parse({ approvedUsers: "not-an-email" }));
    expect(errors.approvedUsers?.[0]).toContain("not-an-email");
  });

  it("accepts approved-for-all alone", () => {
    const data = expectOk(parse({ approvedDepartments: "", approvedForAll: "on" }));
    expect(data.approvedForAll).toBe(true);
  });

  it("rejects approved-for-all together with departments", () => {
    const errors = expectErrors(parse({ approvedForAll: "on" }));
    expect(errors.population).toBeDefined();
  });
});

describe("parsePolicyRuleForm: ALL permission checkboxes", () => {
  it("rejects all-allowed with an allowed list", () => {
    const errors = expectErrors(
      parse({ allPermissionsAllowed: "on", allowedPermissions: "Files.Read" }),
    );
    expect(errors.allowedPermissions).toBeDefined();
  });

  it("rejects all-prohibited with a prohibited list", () => {
    const errors = expectErrors(
      parse({ allPermissionsProhibited: "on", prohibitedPermissions: "Files.Read" }),
    );
    expect(errors.prohibitedPermissions).toBeDefined();
  });

  it("rejects both ALL checkboxes together", () => {
    const errors = expectErrors(
      parse({ allPermissionsAllowed: "on", allPermissionsProhibited: "on" }),
    );
    expect(errors.permissions).toBeDefined();
  });

  it("rejects all-prohibited with an allowed list", () => {
    const errors = expectErrors(
      parse({ allPermissionsProhibited: "on", allowedPermissions: "Files.Read" }),
    );
    expect(errors.allowedPermissions).toBeDefined();
  });

  it("accepts all-allowed with a prohibited list (everything except those)", () => {
    const data = expectOk(
      parse({ allPermissionsAllowed: "on", prohibitedPermissions: "Files.Read" }),
    );
    expect(data.allPermissionsAllowed).toBe(true);
    expect(data.prohibitedPermissions).toEqual(["Files.Read"]);
  });

  it("rejects the same permission on both lists, ignoring case", () => {
    const errors = expectErrors(
      parse({ allowedPermissions: "Files.Read, Mail.Read", prohibitedPermissions: "files.read" }),
    );
    expect(errors.permissions?.[0]).toContain("Files.Read");
  });
});

describe("parsePolicyRuleForm: PROHIBITED", () => {
  it("ignores submitted lists and flags and stores the fixed shape", () => {
    const data = expectOk(
      parse({
        approvalStatus: "PROHIBITED",
        approvedForAll: "on",
        approvedUsers: "sarah@firm.com",
        approvedDepartments: "Finance",
        allPermissionsAllowed: "on",
        allowedPermissions: "Files.Read",
        prohibitedPermissions: "Mail.Read",
        notes: "  Not allowed under any circumstances.  ",
      }),
    );
    expect(data).toMatchObject({
      approvalStatus: "PROHIBITED",
      approvedForAll: false,
      approvedUsers: [],
      approvedDepartments: [],
      allPermissionsAllowed: false,
      allowedPermissions: [],
      allPermissionsProhibited: true,
      prohibitedPermissions: [],
      notes: "Not allowed under any circumstances.",
    });
  });
});

describe("parsePolicyRuleForm: fields", () => {
  it("rejects a blank application name", () => {
    expect(expectErrors(parse({ appName: "   " })).appName).toBeDefined();
  });

  it("rejects an application name over 200 characters", () => {
    expect(expectErrors(parse({ appName: "a".repeat(201) })).appName).toBeDefined();
  });

  it("stores a blank app id as null", () => {
    expect(expectOk(parse({ appId: "  " })).appId).toBeNull();
  });

  it("rejects an unknown approval status", () => {
    expect(expectErrors(parse({ approvalStatus: "MAYBE" })).approvalStatus).toBeDefined();
  });

  it("treats a missing approval status as an error", () => {
    expect(expectErrors(parse({ approvalStatus: undefined })).approvalStatus).toBeDefined();
  });

  it("trims notes and stores blank notes as null", () => {
    expect(expectOk(parse({ notes: "  keep  " })).notes).toBe("keep");
    expect(expectOk(parse({ notes: "   " })).notes).toBeNull();
  });
});
