import { describe, expect, it } from "vitest";

import {
  buildStoragePath,
  canUploadFile,
  checkFileContent,
  FILE_KINDS,
  isExpectedStoragePath,
  MAX_REVIEW_FILE_BYTES,
  parseFileName,
  parseStartUpload,
  storagePathExtension,
  uploadBlockedMessage,
  type FileKind,
  type ReviewFileStatus,
} from "./review-file";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-a444-444444444444";

const STATUSES: ReviewFileStatus[] = [
  "DRAFT",
  "RULES_PENDING_APPROVAL",
  "RULES_APPROVED",
  "EVIDENCE_SUBMITTED",
  "EVIDENCE_VALIDATED",
  "RESULTS_READY",
  "FINALIZED",
];

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("parseFileName", () => {
  it("keeps the base name and lowercases the extension", () => {
    expect(parseFileName("  AI Policy.PDF ")).toEqual({
      ok: true,
      fileName: "AI Policy.PDF",
      ext: "pdf",
    });
  });

  it("drops any directory part", () => {
    expect(parseFileName("C:\\Users\\cco\\policy.docx")).toMatchObject({
      fileName: "policy.docx",
    });
    expect(parseFileName("../../etc/export.csv")).toMatchObject({ fileName: "export.csv" });
  });

  it("returns an empty extension when there is none", () => {
    expect(parseFileName("policy")).toMatchObject({ ok: true, ext: "" });
    expect(parseFileName(".csv")).toMatchObject({ ok: true, ext: "" });
  });

  it.each(["", "   ", "folder/"])("rejects a missing name %j", (raw) => {
    expect(parseFileName(raw)).toEqual({ ok: false, error: "File name is missing." });
  });

  it("rejects control characters", () => {
    expect(parseFileName("pol\u0000icy.pdf").ok).toBe(false);
    expect(parseFileName("pol\nicy.pdf").ok).toBe(false);
  });

  it("limits the length to 255 characters", () => {
    expect(parseFileName(`${"a".repeat(251)}.pdf`).ok).toBe(true);
    expect(parseFileName(`${"a".repeat(252)}.pdf`).ok).toBe(false);
  });
});

describe("parseStartUpload", () => {
  it("accepts PDF and DOCX policy documents with the server's content type", () => {
    expect(parseStartUpload({ kind: "policy_document", fileName: "Policy.pdf", size: 10 })).toEqual({
      ok: true,
      data: { kind: "policy_document", fileName: "Policy.pdf", ext: "pdf", contentType: "application/pdf" },
    });
    expect(
      parseStartUpload({ kind: "policy_document", fileName: "Policy.DOCX", size: 10 }),
    ).toMatchObject({
      ok: true,
      data: {
        ext: "docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  });

  it("accepts a CSV raw export as text/csv", () => {
    expect(
      parseStartUpload({ kind: "raw_export", fileName: "Microsoft_AI_Access.csv", size: 10 }),
    ).toMatchObject({ ok: true, data: { contentType: "text/csv" } });
  });

  it.each<[FileKind, string, string]>([
    ["policy_document", "policy.csv", "Upload a PDF or Word (.docx) file."],
    ["policy_document", "policy.doc", "Upload a PDF or Word (.docx) file."],
    ["policy_document", "policy", "Upload a PDF or Word (.docx) file."],
    ["raw_export", "export.xlsx", "Upload a CSV file."],
    ["raw_export", "export.pdf", "Upload a CSV file."],
  ])("rejects %s named %s", (kind, fileName, error) => {
    expect(parseStartUpload({ kind, fileName, size: 10 })).toEqual({ ok: false, error });
  });

  it("enforces the size limits", () => {
    const request = { kind: "raw_export", fileName: "export.csv" };
    expect(parseStartUpload({ ...request, size: 0 })).toEqual({ ok: false, error: "File is empty." });
    expect(parseStartUpload({ ...request, size: MAX_REVIEW_FILE_BYTES }).ok).toBe(true);
    expect(parseStartUpload({ ...request, size: MAX_REVIEW_FILE_BYTES + 1 })).toEqual({
      ok: false,
      error: "File is larger than 10 MB.",
    });
    expect(parseStartUpload({ ...request, size: 1.5 }).ok).toBe(false);
  });

  it.each([
    { kind: "evidence", fileName: "export.csv", size: 10 },
    { kind: "raw_export", fileName: 42, size: 10 },
    { kind: "raw_export", fileName: "export.csv", size: "10" },
    null,
    "raw_export",
  ])("rejects a malformed request %j", (input) => {
    expect(parseStartUpload(input).ok).toBe(false);
  });
});

describe("storage paths", () => {
  const path = buildStoragePath(COMPANY, REVIEW, "policy_document", OBJECT, "pdf");

  it("builds {companyId}/{reviewId}/{kind}/{objectId}.{ext}", () => {
    expect(path).toBe(`${COMPANY}/${REVIEW}/policy_document/${OBJECT}.pdf`);
    expect(storagePathExtension(path)).toBe("pdf");
  });

  it("accepts paths it builds", () => {
    expect(isExpectedStoragePath(path, COMPANY, REVIEW, "policy_document")).toBe(true);
    const docx = buildStoragePath(COMPANY, REVIEW, "policy_document", OBJECT, "docx");
    expect(isExpectedStoragePath(docx, COMPANY, REVIEW, "policy_document")).toBe(true);
    const csv = buildStoragePath(COMPANY, REVIEW, "raw_export", OBJECT, "csv");
    expect(isExpectedStoragePath(csv, COMPANY, REVIEW, "raw_export")).toBe(true);
  });

  it.each([
    ["another company", `${OTHER}/${REVIEW}/policy_document/${OBJECT}.pdf`],
    ["another review", `${COMPANY}/${OTHER}/policy_document/${OBJECT}.pdf`],
    ["another kind", `${COMPANY}/${REVIEW}/raw_export/${OBJECT}.pdf`],
    ["an evidence path", `${COMPANY}/${REVIEW}/evidence/${OBJECT}.pdf`],
    ["a parent segment", `${COMPANY}/${REVIEW}/policy_document/../${OBJECT}.pdf`],
    ["an extra segment", `${COMPANY}/${REVIEW}/policy_document/x/${OBJECT}.pdf`],
    ["a leading slash", `/${COMPANY}/${REVIEW}/policy_document/${OBJECT}.pdf`],
    ["an uppercase id", `${COMPANY}/${REVIEW}/policy_document/${OBJECT.toUpperCase()}.pdf`],
    ["a non-v4 id", `${COMPANY}/${REVIEW}/policy_document/44444444-4444-1444-a444-444444444444.pdf`],
    ["a file name instead of an id", `${COMPANY}/${REVIEW}/policy_document/policy.pdf`],
    ["a foreign extension", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}.csv`],
    ["an uppercase extension", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}.PDF`],
    ["no extension", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}`],
    ["a double extension", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}.pdf.pdf`],
    ["trailing whitespace", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}.pdf `],
    ["a trailing newline", `${COMPANY}/${REVIEW}/policy_document/${OBJECT}.pdf\n`],
    ["the bare prefix", `${COMPANY}/${REVIEW}/policy_document/`],
    ["an empty path", ""],
  ])("rejects %s", (_label, candidate) => {
    expect(isExpectedStoragePath(candidate, COMPANY, REVIEW, "policy_document")).toBe(false);
  });

  it("rejects a CSV path for any extension but csv", () => {
    const xlsx = `${COMPANY}/${REVIEW}/raw_export/${OBJECT}.xlsx`;
    expect(isExpectedStoragePath(xlsx, COMPANY, REVIEW, "raw_export")).toBe(false);
  });
});

describe("checkFileContent", () => {
  it("accepts a PDF that starts with %PDF-", () => {
    expect(checkFileContent("policy_document", "pdf", text("%PDF-1.7\n..."))).toEqual({ ok: true });
  });

  it.each([
    ["%PDF without the dash", text("%PDF")],
    ["a ZIP", bytes(0x50, 0x4b, 0x03, 0x04)],
    ["plain text", text("hello")],
  ])("rejects %s as a PDF", (_label, content) => {
    expect(checkFileContent("policy_document", "pdf", content)).toEqual({
      ok: false,
      error: "This file is not a valid PDF.",
    });
  });

  it("accepts a DOCX that starts with a ZIP header", () => {
    expect(checkFileContent("policy_document", "docx", bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toEqual({
      ok: true,
    });
  });

  it.each([
    ["plain text", text("hello")],
    ["just PK", text("PK")],
    ["a PDF", text("%PDF-1.7")],
  ])("rejects %s as a DOCX", (_label, content) => {
    expect(checkFileContent("policy_document", "docx", content)).toEqual({
      ok: false,
      error: "This file is not a valid Word (.docx) document.",
    });
  });

  it("accepts UTF-8 CSV text, with or without a byte-order mark", () => {
    expect(checkFileContent("raw_export", "csv", text("user,app\nsarah@example.com,Otter AI\n"))).toEqual({
      ok: true,
    });
    expect(checkFileContent("raw_export", "csv", text("\uFEFFuser,app\n"))).toEqual({ ok: true });
  });

  it("rejects a CSV that is not UTF-8", () => {
    // UTF-16 LE byte-order mark followed by "u".
    expect(checkFileContent("raw_export", "csv", bytes(0xff, 0xfe, 0x75, 0x00))).toEqual({
      ok: false,
      error: "This file is not UTF-8 text. Save it as CSV UTF-8.",
    });
  });

  it("rejects a CSV that contains a NUL byte", () => {
    expect(checkFileContent("raw_export", "csv", bytes(0x50, 0x4b, 0x03, 0x04, 0x00))).toEqual({
      ok: false,
      error: "This file is not a text CSV. Save it as CSV UTF-8.",
    });
  });

  it("rejects empty and oversize files", () => {
    expect(checkFileContent("raw_export", "csv", bytes())).toEqual({
      ok: false,
      error: "File is empty.",
    });
    const big = new Uint8Array(MAX_REVIEW_FILE_BYTES + 1);
    big.set(text("%PDF-"));
    expect(checkFileContent("policy_document", "pdf", big)).toEqual({
      ok: false,
      error: "File is larger than 10 MB.",
    });
  });

  it("rejects an extension the kind does not allow", () => {
    expect(checkFileContent("raw_export", "pdf", text("%PDF-1.7")).ok).toBe(false);
    expect(checkFileContent("policy_document", "csv", text("a,b")).ok).toBe(false);
  });
});

describe("canUploadFile", () => {
  const expected: Record<FileKind, Record<ReviewFileStatus, boolean>> = {
    policy_document: {
      DRAFT: true,
      RULES_PENDING_APPROVAL: true,
      RULES_APPROVED: true,
      EVIDENCE_SUBMITTED: true,
      EVIDENCE_VALIDATED: true,
      RESULTS_READY: true,
      FINALIZED: false,
    },
    raw_export: {
      DRAFT: false,
      RULES_PENDING_APPROVAL: false,
      RULES_APPROVED: true,
      EVIDENCE_SUBMITTED: true,
      EVIDENCE_VALIDATED: false,
      RESULTS_READY: false,
      FINALIZED: false,
    },
  };

  for (const kind of FILE_KINDS) {
    it.each(STATUSES)(`${kind} in %s`, (status) => {
      expect(canUploadFile(kind, status)).toBe(expected[kind][status]);
      expect(uploadBlockedMessage(kind, status) === null).toBe(expected[kind][status]);
    });
  }

  it("explains why an upload is blocked", () => {
    expect(uploadBlockedMessage("raw_export", "DRAFT")).toBe(
      "Approve your policy rules before adding evidence.",
    );
    expect(uploadBlockedMessage("raw_export", "EVIDENCE_VALIDATED")).toBe(
      "Evidence for this review has already been processed.",
    );
    expect(uploadBlockedMessage("policy_document", "FINALIZED")).toBe(
      "This review is finalized. Its files can't be changed.",
    );
  });
});
