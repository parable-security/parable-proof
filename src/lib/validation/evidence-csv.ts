// Evidence CSV validation and normalization (Screen 3). Pure: no database, no
// Next.js, no file system, no clock. The DB check constraint on evidence_records
// enforces the same scope/email rule.
import { parse } from "csv-parse/sync";
import { z } from "zod";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DATA_ROWS = 50_000;

export const REQUIRED_COLUMNS = [
  "user_email",
  "app_name",
  "app_id",
  "permission_scope",
  "consent_type",
  "resource_name",
  "observed_at",
] as const;

export const OPTIONAL_COLUMNS = ["user_department", "service_principal_id"] as const;

export type EvidenceColumn =
  | (typeof REQUIRED_COLUMNS)[number]
  | (typeof OPTIONAL_COLUMNS)[number];

const KNOWN_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export type AssignmentScope = "TENANT" | "USER";

// evidence_records insert shape minus id, review_id and created_at (added by
// the caller). Declared here rather than imported from db/schema so this
// module stays pure.
export type EvidenceRecordInput = {
  rowNumber: number;
  userEmail: string | null;
  appName: string;
  appId: string;
  servicePrincipalId: string | null;
  permissionScope: string;
  consentType: string;
  resourceName: string;
  observedAt: Date;
  assignmentScope: AssignmentScope;
  userDepartment: string | null;
};

// rowNumber null = file-level error; column null = whole row or whole file.
export type EvidenceCsvError = {
  rowNumber: number | null;
  column: EvidenceColumn | null;
  message: string;
  value: string | null;
};

export type DuplicateRow = { rowNumber: number; duplicateOfRowNumber: number };

export type EvidenceCsvResult =
  | {
      ok: true;
      records: EvidenceRecordInput[];
      rowCount: number;
      duplicateCount: number;
      duplicates: DuplicateRow[];
    }
  | { ok: false; errors: EvidenceCsvError[] };

const CONSENT_SCOPES = new Map<string, AssignmentScope>([
  ["tenant", "TENANT"],
  ["allprincipals", "TENANT"],
  ["user", "USER"],
  ["principal", "USER"],
]);

const emailSchema = z.email();

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2})))?$/;

// A date (midnight UTC) or a date-time with timezone. Returns null for
// anything else, including dates that do not exist. Date.parse is not used
// because its leniency differs between engines.
export function parseObservedAt(raw: string): Date | null {
  const match = ISO_DATE_TIME.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zone, sign, offsetH, offsetM] = match;

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (h === undefined) return date;

  const hour = Number(h);
  const minute = Number(mi);
  const second = s === undefined ? 0 : Number(s);
  if (hour > 23 || minute > 59 || second > 59) return null;
  // Fractions beyond milliseconds are truncated (PowerShell writes 7 digits).
  const ms = fraction === undefined ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));
  date.setUTCHours(hour, minute, second, ms);

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const hours = Number(offsetH);
    const minutes = Number(offsetM);
    if (hours > 14 || minutes > 59) return null;
    offsetMinutes = (sign === "-" ? -1 : 1) * (hours * 60 + minutes);
  }
  return new Date(date.getTime() - offsetMinutes * 60_000);
}

function fileError(message: string): EvidenceCsvResult {
  return { ok: false, errors: [{ rowNumber: null, column: null, message, value: null }] };
}

function utf8ByteLength(input: string | Uint8Array): number {
  if (typeof input !== "string") return input.byteLength;
  // Every UTF-16 code unit is at least one UTF-8 byte, so skip encoding huge strings.
  if (input.length > MAX_FILE_BYTES) return input.length;
  return new TextEncoder().encode(input).byteLength;
}

function isKnownColumn(name: string): name is EvidenceColumn {
  return KNOWN_COLUMNS.includes(name);
}

type ColumnIndexes = Map<EvidenceColumn, number>;

function readHeader(
  cells: string[],
): { ok: true; columns: ColumnIndexes } | { ok: false; errors: EvidenceCsvError[] } {
  const columns: ColumnIndexes = new Map();
  const repeated = new Set<EvidenceColumn>();
  cells.forEach((cell, index) => {
    const name = cell.trim().toLowerCase();
    if (!isKnownColumn(name)) return;
    if (columns.has(name)) {
      repeated.add(name);
    } else {
      columns.set(name, index);
    }
  });

  const errors: EvidenceCsvError[] = [];
  for (const name of repeated) {
    errors.push({
      rowNumber: null,
      column: name,
      message: `Column '${name}' appears more than once.`,
      value: null,
    });
  }
  for (const name of REQUIRED_COLUMNS) {
    if (!columns.has(name)) {
      errors.push({
        rowNumber: null,
        column: name,
        message: `Missing required column '${name}'.`,
        value: null,
      });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, columns };
}

const NON_BLANK_COLUMNS = ["app_name", "app_id", "permission_scope", "resource_name"] as const;

function validateRow(
  rowNumber: number,
  cells: string[],
  columns: ColumnIndexes,
  headerLength: number,
  errors: EvidenceCsvError[],
): EvidenceRecordInput | null {
  if (cells.length !== headerLength) {
    errors.push({
      rowNumber,
      column: null,
      message: `Row has ${cells.length} cells; header has ${headerLength}.`,
      value: null,
    });
    return null;
  }

  const errorCountBefore = errors.length;
  const raw = (column: EvidenceColumn) => {
    const index = columns.get(column);
    return index === undefined ? "" : cells[index];
  };
  const value = (column: EvidenceColumn) => raw(column).trim();
  const optional = (column: EvidenceColumn) => value(column) || null;
  const addError = (column: EvidenceColumn, message: string) => {
    errors.push({ rowNumber, column, message, value: raw(column) });
  };

  for (const column of NON_BLANK_COLUMNS) {
    if (value(column) === "") addError(column, `${column} is required.`);
  }

  const consentType = value("consent_type");
  const scope = CONSENT_SCOPES.get(consentType.toLowerCase());
  if (!scope) {
    addError("consent_type", "consent_type must be Tenant, AllPrincipals, User or Principal.");
  }

  // Scope-dependent email checks are skipped when consent_type is invalid.
  const email = value("user_email").toLowerCase();
  if (scope === "TENANT" && email !== "") {
    addError("user_email", "user_email must be blank for tenant-wide consent.");
  }
  if (scope === "USER") {
    if (email === "") {
      addError("user_email", "user_email is required for user consent.");
    } else if (!emailSchema.safeParse(email).success) {
      addError("user_email", "user_email is not a valid email address.");
    }
  }

  const observedAt = parseObservedAt(value("observed_at"));
  if (!observedAt) {
    addError(
      "observed_at",
      "observed_at must be an ISO 8601 date (2026-10-01) or date-time with timezone (2026-10-01T14:30:00Z).",
    );
  }

  if (errors.length > errorCountBefore || !scope || !observedAt) return null;
  return {
    rowNumber,
    userEmail: scope === "USER" ? email : null,
    appName: value("app_name"),
    appId: value("app_id"),
    servicePrincipalId: optional("service_principal_id"),
    permissionScope: value("permission_scope"),
    consentType,
    resourceName: value("resource_name"),
    observedAt,
    assignmentScope: scope,
    userDepartment: optional("user_department"),
  };
}

// Same user_email + app_id + permission_scope + consent_type + observed_at.
// Case is ignored for the key only; dates compare as instants.
function duplicateKey(record: EvidenceRecordInput): string {
  return [
    record.userEmail ?? "",
    record.appId.toLowerCase(),
    record.permissionScope.toLowerCase(),
    record.consentType.toLowerCase(),
    record.observedAt.toISOString(),
  ].join("\u0000");
}

export function parseEvidenceCsv(input: string | Uint8Array): EvidenceCsvResult {
  if (utf8ByteLength(input) > MAX_FILE_BYTES) {
    return fileError("File is larger than 10 MB.");
  }

  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      // Strips a UTF-8 byte-order mark.
      text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      return fileError("File is not valid UTF-8 text. Save it as CSV UTF-8.");
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let rows: string[][];
  try {
    rows = parse(text, { delimiter: ",", relax_column_count: true, skip_empty_lines: false });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fileError(`File is not a valid CSV: ${detail}`);
  }
  if (rows.length === 0) return fileError("File is empty.");

  const header = readHeader(rows[0]);
  if (!header.ok) return { ok: false, errors: header.errors };

  // Row numbers match a spreadsheet: header is row 1. Blank rows are skipped
  // but still counted.
  const dataRows: { rowNumber: number; cells: string[] }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((cell) => cell.trim() === "")) continue;
    dataRows.push({ rowNumber: i + 1, cells });
  }
  if (dataRows.length === 0) return fileError("File has no data rows.");
  if (dataRows.length > MAX_DATA_ROWS) {
    return fileError(`File has more than ${MAX_DATA_ROWS.toLocaleString("en-US")} data rows.`);
  }

  const errors: EvidenceCsvError[] = [];
  const parsed: EvidenceRecordInput[] = [];
  for (const { rowNumber, cells } of dataRows) {
    const record = validateRow(rowNumber, cells, header.columns, rows[0].length, errors);
    if (record) parsed.push(record);
  }
  // No partial import.
  if (errors.length > 0) return { ok: false, errors };

  const firstRowByKey = new Map<string, number>();
  const records: EvidenceRecordInput[] = [];
  const duplicates: DuplicateRow[] = [];
  for (const record of parsed) {
    const key = duplicateKey(record);
    const first = firstRowByKey.get(key);
    if (first === undefined) {
      firstRowByKey.set(key, record.rowNumber);
      records.push(record);
    } else {
      duplicates.push({ rowNumber: record.rowNumber, duplicateOfRowNumber: first });
    }
  }

  return {
    ok: true,
    records,
    rowCount: records.length,
    duplicateCount: duplicates.length,
    duplicates,
  };
}

const FORMULA_START = /^[=+\-@\t\r]/;

// Neutralizes spreadsheet formula injection, then applies RFC 4180 quoting.
function errorFileCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// The downloadable error file: one line per error, then one per ignored duplicate.
// Starts with a BOM and uses CRLF so Excel opens it as UTF-8.
export function buildErrorCsv(issues: {
  errors?: EvidenceCsvError[];
  duplicates?: DuplicateRow[];
}): string {
  const lines: string[][] = [["row", "column", "message", "value"]];
  for (const error of issues.errors ?? []) {
    lines.push([
      error.rowNumber === null ? "" : String(error.rowNumber),
      error.column ?? "",
      error.message,
      error.value ?? "",
    ]);
  }
  for (const duplicate of issues.duplicates ?? []) {
    lines.push([
      String(duplicate.rowNumber),
      "",
      `Duplicate of row ${duplicate.duplicateOfRowNumber} (same user_email, app_id, permission_scope, consent_type, observed_at); ignored.`,
      "",
    ]);
  }
  return "﻿" + lines.map((cells) => cells.map(errorFileCell).join(",")).join("\r\n") + "\r\n";
}
