import { describe, expect, it } from "vitest";

import {
  buildErrorCsv,
  MAX_DATA_ROWS,
  MAX_FILE_BYTES,
  OPTIONAL_COLUMNS,
  parseEvidenceCsv,
  parseObservedAt,
  REQUIRED_COLUMNS,
  type EvidenceColumn,
  type EvidenceCsvError,
  type EvidenceCsvResult,
} from "./evidence-csv";

const COLUMNS: EvidenceColumn[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
const HEADER = COLUMNS.join(",");

const BASE_ROW: Record<EvidenceColumn, string> = {
  user_email: "sarah@example.com",
  app_name: "Otter AI",
  app_id: "app-otter",
  permission_scope: "Files.Read",
  consent_type: "User",
  resource_name: "Microsoft Graph",
  observed_at: "2026-10-01T14:30:00Z",
  user_department: "Finance",
  service_principal_id: "sp-otter",
};

const TENANT_ROW: Partial<Record<EvidenceColumn, string>> = {
  user_email: "",
  app_name: "Copilot",
  app_id: "app-copilot",
  permission_scope: "Sites.Read.All",
  consent_type: "Tenant",
  user_department: "",
};

// One data line in HEADER column order. Values are not quoted.
function line(overrides: Partial<Record<EvidenceColumn, string>> = {}): string {
  return COLUMNS.map((column) => overrides[column] ?? BASE_ROW[column]).join(",");
}

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n") + "\n";
}

function expectOk(result: EvidenceCsvResult) {
  if (!result.ok) {
    throw new Error(`expected success, got ${JSON.stringify(result.errors)}`);
  }
  return result;
}

function expectErrors(result: EvidenceCsvResult): EvidenceCsvError[] {
  if (result.ok) throw new Error("expected errors, got success");
  return result.errors;
}

function expectFileError(result: EvidenceCsvResult, message: string | RegExp) {
  const errors = expectErrors(result);
  expect(errors).toHaveLength(1);
  expect(errors[0].rowNumber).toBeNull();
  expect(errors[0].message).toMatch(message);
}

describe("parseObservedAt", () => {
  it.each([
    ["2026-10-01", "2026-10-01T00:00:00.000Z"],
    ["2026-10-01T14:30:00Z", "2026-10-01T14:30:00.000Z"],
    ["2026-10-01T14:30Z", "2026-10-01T14:30:00.000Z"],
    ["2026-10-01T20:00:00+05:30", "2026-10-01T14:30:00.000Z"],
    ["2026-10-01T09:30:00-05:00", "2026-10-01T14:30:00.000Z"],
    ["2026-10-01T14:30:00.1234567Z", "2026-10-01T14:30:00.123Z"],
    ["2026-10-01T14:30:00.5Z", "2026-10-01T14:30:00.500Z"],
    ["2024-02-29", "2024-02-29T00:00:00.000Z"],
  ])("accepts %s", (raw, iso) => {
    expect(parseObservedAt(raw)?.toISOString()).toBe(iso);
  });

  it.each([
    "",
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-10-1",
    "2026-10-01T14:30:00",
    "2026-10-01 14:30Z",
    "10/26/2026",
    "2026-10-01T25:00Z",
    "2026-10-01T14:60Z",
    "2026-10-01T14:30:60Z",
    "2026-10-01T14:30+15:00",
    "2026-10-01T14:30:00Z extra",
  ])("rejects %j", (raw) => {
    expect(parseObservedAt(raw)).toBeNull();
  });
});

describe("parseEvidenceCsv: valid files", () => {
  it("normalizes USER and TENANT rows into evidence records", () => {
    const result = expectOk(
      parseEvidenceCsv(
        csv(
          line({ user_email: "Sarah@Example.COM" }),
          line({ user_email: "james@example.com", consent_type: "Principal" }),
          line({ ...TENANT_ROW }),
          line({ ...TENANT_ROW, consent_type: "AllPrincipals", service_principal_id: "" }),
        ),
      ),
    );
    expect(result.rowCount).toBe(4);
    expect(result.duplicateCount).toBe(0);
    expect(result.duplicates).toEqual([]);
    expect(result.records[0]).toEqual({
      rowNumber: 2,
      userEmail: "sarah@example.com",
      appName: "Otter AI",
      appId: "app-otter",
      servicePrincipalId: "sp-otter",
      permissionScope: "Files.Read",
      consentType: "User",
      resourceName: "Microsoft Graph",
      observedAt: new Date("2026-10-01T14:30:00.000Z"),
      assignmentScope: "USER",
      userDepartment: "Finance",
    });
    expect(result.records[1]).toMatchObject({ assignmentScope: "USER", consentType: "Principal" });
    expect(result.records[2]).toMatchObject({
      rowNumber: 4,
      userEmail: null,
      assignmentScope: "TENANT",
      userDepartment: null,
    });
    expect(result.records[3]).toMatchObject({
      userEmail: null,
      assignmentScope: "TENANT",
      consentType: "AllPrincipals",
      servicePrincipalId: null,
    });
  });

  it("trims every value", () => {
    const result = expectOk(
      parseEvidenceCsv(csv(line({ app_name: "  Otter AI ", consent_type: " user ", observed_at: " 2026-10-01 " }))),
    );
    expect(result.records[0]).toMatchObject({
      appName: "Otter AI",
      consentType: "user",
      observedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  it("sets optional fields to null when their columns are absent", () => {
    const header = REQUIRED_COLUMNS.join(",");
    const row = REQUIRED_COLUMNS.map((column) => BASE_ROW[column]).join(",");
    const result = expectOk(parseEvidenceCsv(`${header}\n${row}\n`));
    expect(result.records[0]).toMatchObject({ userDepartment: null, servicePrincipalId: null });
  });

  it("matches headers case-insensitively and ignores surrounding whitespace", () => {
    const header = COLUMNS.map((column) => ` ${column.toUpperCase()} `).join(",");
    const result = expectOk(parseEvidenceCsv(`${header}\n${line()}\n`));
    expect(result.records[0].userEmail).toBe("sarah@example.com");
  });

  it("accepts columns in any order", () => {
    const reversed = [...COLUMNS].reverse();
    const row = reversed.map((column) => BASE_ROW[column]).join(",");
    const result = expectOk(parseEvidenceCsv(`${reversed.join(",")}\n${row}\n`));
    expect(result.records[0].appId).toBe("app-otter");
  });

  it("accepts a UTF-8 byte-order mark in string input", () => {
    expectOk(parseEvidenceCsv("﻿" + csv(line())));
  });

  it("accepts a UTF-8 byte-order mark in byte input", () => {
    const bytes = new TextEncoder().encode("﻿" + csv(line()));
    expect(bytes[0]).toBe(0xef);
    expectOk(parseEvidenceCsv(bytes));
  });

  it("ignores extra columns", () => {
    const result = expectOk(parseEvidenceCsv(`${HEADER},Notes,tenant_id\n${line()},hello,t-1\n`));
    expect(Object.keys(result.records[0])).not.toContain("notes");
    expect(result.records[0]).not.toHaveProperty("tenant_id");
  });

  it("handles CRLF line endings", () => {
    expectOk(parseEvidenceCsv([HEADER, line(), line({ user_email: "james@example.com" })].join("\r\n")));
  });

  it("parses quoted fields with commas, escaped quotes and newlines", () => {
    const quoted = line({
      app_name: '"Otter, AI"',
      resource_name: '"Graph ""beta""\nsecond line"',
    });
    const result = expectOk(parseEvidenceCsv(csv(quoted, line({ user_email: "james@example.com" }))));
    expect(result.records[0]).toMatchObject({
      rowNumber: 2,
      appName: "Otter, AI",
      resourceName: 'Graph "beta"\nsecond line',
    });
    // The multi-line value is still one spreadsheet row.
    expect(result.records[1].rowNumber).toBe(3);
  });
});

describe("parseEvidenceCsv: file-level errors", () => {
  it("reports each missing required column", () => {
    const columns = COLUMNS.filter((column) => column !== "app_id" && column !== "observed_at");
    const errors = expectErrors(parseEvidenceCsv(`${columns.join(",")}\nx\n`));
    expect(errors).toEqual([
      { rowNumber: null, column: "app_id", message: "Missing required column 'app_id'.", value: null },
      {
        rowNumber: null,
        column: "observed_at",
        message: "Missing required column 'observed_at'.",
        value: null,
      },
    ]);
  });

  it("rejects a column that appears twice", () => {
    const errors = expectErrors(parseEvidenceCsv(`${HEADER},APP_ID\n${line()},x\n`));
    expect(errors).toEqual([
      {
        rowNumber: null,
        column: "app_id",
        message: "Column 'app_id' appears more than once.",
        value: null,
      },
    ]);
  });

  it("rejects an empty file", () => {
    expectFileError(parseEvidenceCsv(""), "File is empty.");
  });

  it("rejects a header-only file", () => {
    expectFileError(parseEvidenceCsv(`${HEADER}\n`), "File has no data rows.");
    expectFileError(parseEvidenceCsv(`${HEADER}\n\n,,,,,,,,\n`), "File has no data rows.");
  });

  it("rejects malformed quoting", () => {
    expectFileError(
      parseEvidenceCsv(csv(line({ app_name: '"Otter AI' }))),
      /^File is not a valid CSV: /,
    );
  });

  it("rejects bytes that are not UTF-8", () => {
    // UTF-16 LE byte-order mark followed by "u".
    expectFileError(
      parseEvidenceCsv(new Uint8Array([0xff, 0xfe, 0x75, 0x00])),
      "File is not valid UTF-8 text. Save it as CSV UTF-8.",
    );
  });

  it("rejects a string over 10 MB", () => {
    const big = csv(line()) + "x".repeat(MAX_FILE_BYTES);
    expectFileError(parseEvidenceCsv(big), "File is larger than 10 MB.");
  });

  it("counts multi-byte characters toward the size limit", () => {
    // 3 bytes each in UTF-8, so this is over the limit in bytes but not in characters.
    const big = csv(line()) + "€".repeat(Math.ceil(MAX_FILE_BYTES / 3));
    expectFileError(parseEvidenceCsv(big), "File is larger than 10 MB.");
  });

  it("rejects bytes over 10 MB", () => {
    expectFileError(
      parseEvidenceCsv(new Uint8Array(MAX_FILE_BYTES + 1)),
      "File is larger than 10 MB.",
    );
  });

  it("rejects more than 50,000 data rows", () => {
    const rows = Array.from({ length: MAX_DATA_ROWS + 1 }, () => line());
    expectFileError(parseEvidenceCsv(csv(...rows)), "File has more than 50,000 data rows.");
  });

  it("accepts exactly 50,000 data rows", () => {
    const rows = Array.from({ length: MAX_DATA_ROWS }, (_, i) =>
      line({ user_email: `user${i}@example.com` }),
    );
    const result = expectOk(parseEvidenceCsv(csv(...rows)));
    expect(result.rowCount).toBe(MAX_DATA_ROWS);
    expect(result.records.at(-1)?.rowNumber).toBe(MAX_DATA_ROWS + 1);
  });
});

describe("parseEvidenceCsv: row errors", () => {
  it("rejects a malformed email on a USER row", () => {
    const errors = expectErrors(parseEvidenceCsv(csv(line(), line({ user_email: "not-an-email" }))));
    expect(errors).toEqual([
      {
        rowNumber: 3,
        column: "user_email",
        message: "user_email is not a valid email address.",
        value: "not-an-email",
      },
    ]);
  });

  it("rejects a USER row without an email", () => {
    const errors = expectErrors(parseEvidenceCsv(csv(line({ user_email: "" }))));
    expect(errors).toEqual([
      {
        rowNumber: 2,
        column: "user_email",
        message: "user_email is required for user consent.",
        value: "",
      },
    ]);
  });

  it("rejects a TENANT row with an email", () => {
    const errors = expectErrors(
      parseEvidenceCsv(csv(line({ ...TENANT_ROW, user_email: "firm-wide" }))),
    );
    expect(errors).toEqual([
      {
        rowNumber: 2,
        column: "user_email",
        message: "user_email must be blank for tenant-wide consent.",
        value: "firm-wide",
      },
    ]);
  });

  it.each(["Admin", ""])("rejects consent_type %j", (consentType) => {
    const errors = expectErrors(parseEvidenceCsv(csv(line({ consent_type: consentType }))));
    expect(errors).toEqual([
      {
        rowNumber: 2,
        column: "consent_type",
        message: "consent_type must be Tenant, AllPrincipals, User or Principal.",
        value: consentType,
      },
    ]);
  });

  it.each(["2026-02-30", "2026-10-01T14:30:00", "10/26/2026", ""])(
    "rejects observed_at %j",
    (observedAt) => {
      const errors = expectErrors(parseEvidenceCsv(csv(line({ observed_at: observedAt }))));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ rowNumber: 2, column: "observed_at", value: observedAt });
    },
  );

  it("reports every blank required field in a row", () => {
    const errors = expectErrors(
      parseEvidenceCsv(
        csv(line({ app_name: "", app_id: " ", permission_scope: "", resource_name: "" })),
      ),
    );
    expect(errors.map((e) => [e.rowNumber, e.column, e.message])).toEqual([
      [2, "app_name", "app_name is required."],
      [2, "app_id", "app_id is required."],
      [2, "permission_scope", "permission_scope is required."],
      [2, "resource_name", "resource_name is required."],
    ]);
  });

  it("rejects a row whose cell count differs from the header", () => {
    const short = line().split(",").slice(0, -1).join(",");
    const errors = expectErrors(parseEvidenceCsv(csv(short, `${line()},extra`)));
    expect(errors).toEqual([
      { rowNumber: 2, column: null, message: "Row has 8 cells; header has 9.", value: null },
      { rowNumber: 3, column: null, message: "Row has 10 cells; header has 9.", value: null },
    ]);
  });

  it("reports errors from every row and imports nothing", () => {
    const result = parseEvidenceCsv(
      csv(line(), line({ user_email: "bad" }), line(), line({ observed_at: "soon" })),
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({ rowNumber: 3, column: "user_email" }),
        expect.objectContaining({ rowNumber: 5, column: "observed_at" }),
      ],
    });
    expect(result).not.toHaveProperty("records");
  });

  it("numbers rows as a spreadsheet does, counting blank lines", () => {
    const errors = expectErrors(
      parseEvidenceCsv(csv(line(), "", ",,,,,,,,", line({ user_email: "bad" }))),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(5);
  });

  it("keeps the original (untrimmed) cell value in errors", () => {
    const errors = expectErrors(parseEvidenceCsv(csv(line({ user_email: " bad " }))));
    expect(errors[0].value).toBe(" bad ");
  });
});

describe("parseEvidenceCsv: duplicates", () => {
  it("keeps the first copy and lists the rest", () => {
    const result = expectOk(
      parseEvidenceCsv(
        csv(
          line(),
          line({ user_email: "james@example.com" }),
          line(),
          line({ resource_name: "Different resource" }),
          line({ user_department: "Sales" }),
        ),
      ),
    );
    expect(result.records.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(result.rowCount).toBe(2);
    expect(result.duplicateCount).toBe(3);
    expect(result.duplicates).toEqual([
      { rowNumber: 4, duplicateOfRowNumber: 2 },
      { rowNumber: 5, duplicateOfRowNumber: 2 },
      { rowNumber: 6, duplicateOfRowNumber: 2 },
    ]);
  });

  it("ignores case and equivalent date forms when comparing", () => {
    const result = expectOk(
      parseEvidenceCsv(
        csv(
          line({ observed_at: "2026-10-01" }),
          line({
            user_email: "SARAH@example.com",
            app_id: "APP-OTTER",
            permission_scope: "files.read",
            consent_type: "USER",
            observed_at: "2026-10-01T00:00:00Z",
          }),
          line({ observed_at: "2026-09-30T20:00:00-04:00" }),
        ),
      ),
    );
    expect(result.rowCount).toBe(1);
    expect(result.duplicates).toEqual([
      { rowNumber: 3, duplicateOfRowNumber: 2 },
      { rowNumber: 4, duplicateOfRowNumber: 2 },
    ]);
  });

  it("treats different consent types as different rows", () => {
    const result = expectOk(parseEvidenceCsv(csv(line(), line({ consent_type: "Principal" }))));
    expect(result.duplicateCount).toBe(0);
  });

  it("detects duplicate TENANT rows", () => {
    const result = expectOk(parseEvidenceCsv(csv(line(TENANT_ROW), line(TENANT_ROW))));
    expect(result.duplicates).toEqual([{ rowNumber: 3, duplicateOfRowNumber: 2 }]);
  });
});

describe("buildErrorCsv", () => {
  const BOM = "﻿";

  it("writes a header, errors, then duplicates with CRLF and a BOM", () => {
    const output = buildErrorCsv({
      errors: [
        { rowNumber: null, column: "app_id", message: "Missing required column 'app_id'.", value: null },
        { rowNumber: 3, column: "user_email", message: "user_email is not a valid email address.", value: "bad" },
      ],
      duplicates: [{ rowNumber: 5, duplicateOfRowNumber: 2 }],
    });
    expect(output.startsWith(BOM)).toBe(true);
    expect(output.slice(1).split("\r\n")).toEqual([
      "row,column,message,value",
      ",app_id,Missing required column 'app_id'.,",
      "3,user_email,user_email is not a valid email address.,bad",
      '5,,"Duplicate of row 2 (same user_email, app_id, permission_scope, consent_type, observed_at); ignored.",',
      "",
    ]);
  });

  it("writes only the header when there is nothing to report", () => {
    expect(buildErrorCsv({})).toBe(`${BOM}row,column,message,value\r\n`);
  });

  it("quotes values containing commas, quotes and newlines", () => {
    const output = buildErrorCsv({
      errors: [{ rowNumber: 2, column: "app_name", message: "m", value: 'a,b "c"\nd' }],
    });
    expect(output).toContain('2,app_name,m,"a,b ""c""\nd"\r\n');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])(
    "neutralizes formula injection in %j",
    (value) => {
      const output = buildErrorCsv({
        errors: [{ rowNumber: 2, column: "app_name", message: "m", value }],
      });
      const cell = /[\r\n]/.test(value) ? `"'${value}"` : `'${value}`;
      expect(output).toContain(`2,app_name,m,${cell}\r\n`);
    },
  );

  it("quotes a neutralized value that also needs quoting", () => {
    const output = buildErrorCsv({
      errors: [{ rowNumber: 2, column: "app_name", message: "m", value: '=HYPERLINK("x","y")' }],
    });
    expect(output).toContain(`2,app_name,m,"'=HYPERLINK(""x"",""y"")"\r\n`);
  });

  it("leaves ordinary values unchanged", () => {
    const output = buildErrorCsv({
      errors: [{ rowNumber: 2, column: "app_name", message: "m", value: "Otter AI" }],
    });
    expect(output).toContain("2,app_name,m,Otter AI\r\n");
  });

  it("neutralizes values that came from an uploaded file", () => {
    const result = parseEvidenceCsv(csv(line({ user_email: "=1+1" })));
    expect(buildErrorCsv({ errors: expectErrors(result) })).toContain(",'=1+1\r\n");
  });
});
