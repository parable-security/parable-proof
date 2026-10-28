// Rules for files uploaded to a review: the customer's policy document and raw
// Microsoft export, and the evidence CSV converted by Parable staff. Pure: no
// database, no Next.js, no storage. The storage module applies these on the
// server; the browser repeats some checks for UX only.
import { z } from "zod";

export const REVIEW_FILE_BUCKET = "review-files";
export const MAX_REVIEW_FILE_BYTES = 10 * 1024 * 1024;

export const FILE_KINDS = ["policy_document", "raw_export", "converted_evidence"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const fileKindSchema = z.enum(FILE_KINDS);

// The kinds a customer_admin may upload or download. converted_evidence is staff-only.
export const CUSTOMER_FILE_KINDS = ["policy_document", "raw_export"] as const;
export type CustomerFileKind = (typeof CUSTOMER_FILE_KINDS)[number];

export const customerFileKindSchema = z.enum(CUSTOMER_FILE_KINDS);

// Same values as the review_status enum; declared here so this module stays pure.
export type ReviewFileStatus =
  | "DRAFT"
  | "RULES_PENDING_APPROVAL"
  | "RULES_APPROVED"
  | "EVIDENCE_SUBMITTED"
  | "EVIDENCE_VALIDATED"
  | "RESULTS_READY"
  | "FINALIZED";

// Allowed extensions per kind, and the content type sent on upload. The
// server picks the content type: browsers report CSV inconsistently.
export const KIND_EXTENSIONS: Record<FileKind, Readonly<Record<string, string>>> = {
  policy_document: {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  raw_export: {
    csv: "text/csv",
  },
  converted_evidence: {
    csv: "text/csv",
  },
};

export const KIND_ACCEPT: Record<FileKind, string> = {
  policy_document: ".pdf,.docx",
  raw_export: ".csv",
  converted_evidence: ".csv",
};

const WRONG_TYPE_MESSAGE: Record<FileKind, string> = {
  policy_document: "Upload a PDF or Word (.docx) file.",
  raw_export: "Upload a CSV file.",
  converted_evidence: "Upload a CSV file.",
};

const TOO_LARGE_MESSAGE = "File is larger than 10 MB.";
const EMPTY_MESSAGE = "File is empty.";

type Check<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_FILE_NAME_LENGTH = 255;

// The original file name, kept for display only (never used in a storage path).
export function parseFileName(raw: string): Check<{ fileName: string; ext: string }> {
  const fileName = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1).trim();
  if (fileName === "") return { ok: false, error: "File name is missing." };
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    return { ok: false, error: `File name must be ${MAX_FILE_NAME_LENGTH} characters or fewer.` };
  }
  if (CONTROL_CHARS.test(fileName)) {
    return { ok: false, error: "File name contains invalid characters." };
  }
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return { ok: true, fileName, ext };
}

export function isAllowedExtension(kind: FileKind, ext: string): boolean {
  return Object.hasOwn(KIND_EXTENSIONS[kind], ext);
}

const startUploadSchema = z.object({
  kind: fileKindSchema,
  fileName: z.string(),
  size: z.int().min(1, EMPTY_MESSAGE).max(MAX_REVIEW_FILE_BYTES, TOO_LARGE_MESSAGE),
});

export type StartUpload = {
  kind: FileKind;
  fileName: string;
  ext: string;
  contentType: string;
};

// Validates the browser's request for an upload URL (declared name and size).
export function parseStartUpload(input: unknown): Check<{ data: StartUpload }> {
  const parsed = startUploadSchema.safeParse(input);
  if (!parsed.success) {
    const sizeIssue = parsed.error.issues.find((issue) => issue.path[0] === "size");
    return { ok: false, error: sizeIssue?.message ?? "Invalid upload request." };
  }
  const { kind } = parsed.data;
  const name = parseFileName(parsed.data.fileName);
  if (!name.ok) return name;
  if (!isAllowedExtension(kind, name.ext)) {
    return { ok: false, error: WRONG_TYPE_MESSAGE[kind] };
  }
  return {
    ok: true,
    data: {
      kind,
      fileName: name.fileName,
      ext: name.ext,
      contentType: KIND_EXTENSIONS[kind][name.ext],
    },
  };
}

// {companyId}/{reviewId}/{kind}/{objectId}.{ext}. All parts come from the server.
export function buildStoragePath(
  companyId: string,
  reviewId: string,
  kind: FileKind,
  objectId: string,
  ext: string,
): string {
  return `${companyId}/${reviewId}/${kind}/${objectId}.${ext}`;
}

const OBJECT_ID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const OBJECT_NAME: Record<FileKind, RegExp> = {
  policy_document: new RegExp(`^${OBJECT_ID}\\.(?:pdf|docx)$`),
  raw_export: new RegExp(`^${OBJECT_ID}\\.csv$`),
  converted_evidence: new RegExp(`^${OBJECT_ID}\\.csv$`),
};

// A path sent back by the browser is untrusted. It must be exactly a path
// buildStoragePath could have produced for this company, review and kind.
export function isExpectedStoragePath(
  path: string,
  companyId: string,
  reviewId: string,
  kind: FileKind,
): boolean {
  const prefix = `${companyId}/${reviewId}/${kind}/`;
  return path.startsWith(prefix) && OBJECT_NAME[kind].test(path.slice(prefix.length));
}

export function storagePathExtension(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1);
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (DOCX is a ZIP)

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte);
}

// Checks the stored bytes: real size, and that the content matches the extension.
export function checkFileContent(kind: FileKind, ext: string, bytes: Uint8Array): Check {
  if (!isAllowedExtension(kind, ext)) return { ok: false, error: WRONG_TYPE_MESSAGE[kind] };
  if (bytes.byteLength === 0) return { ok: false, error: EMPTY_MESSAGE };
  if (bytes.byteLength > MAX_REVIEW_FILE_BYTES) return { ok: false, error: TOO_LARGE_MESSAGE };

  if (ext === "pdf" && !startsWith(bytes, PDF_MAGIC)) {
    return { ok: false, error: "This file is not a valid PDF." };
  }
  if (ext === "docx" && !startsWith(bytes, ZIP_MAGIC)) {
    return { ok: false, error: "This file is not a valid Word (.docx) document." };
  }
  if (ext === "csv") {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, error: "This file is not UTF-8 text. Save it as CSV UTF-8." };
    }
    // A NUL byte means binary content (for example an .xlsx renamed to .csv).
    if (text.includes("\u0000")) {
      return { ok: false, error: "This file is not a text CSV. Save it as CSV UTF-8." };
    }
  }
  return { ok: true };
}

const RAW_EXPORT_STATUSES: readonly ReviewFileStatus[] = ["RULES_APPROVED", "EVIDENCE_SUBMITTED"];

const VALIDATED_OR_LATER: readonly ReviewFileStatus[] = [
  "EVIDENCE_VALIDATED",
  "RESULTS_READY",
  "FINALIZED",
];

export function isEvidenceValidated(status: ReviewFileStatus): boolean {
  return VALIDATED_OR_LATER.includes(status);
}

export function canUploadFile(kind: FileKind, status: ReviewFileStatus): boolean {
  if (kind === "policy_document") return status !== "FINALIZED";
  if (kind === "raw_export") return RAW_EXPORT_STATUSES.includes(status);
  return status === "EVIDENCE_SUBMITTED";
}

// Why an upload is not allowed, or null when it is.
export function uploadBlockedMessage(kind: FileKind, status: ReviewFileStatus): string | null {
  if (canUploadFile(kind, status)) return null;
  if (status === "FINALIZED") return "This review is finalized. Its files can't be changed.";
  if (kind === "converted_evidence") {
    return isEvidenceValidated(status)
      ? "Evidence for this review has already been validated."
      : "Waiting for the customer's Microsoft export.";
  }
  if (status === "DRAFT" || status === "RULES_PENDING_APPROVAL") {
    return "Approve your policy rules before adding evidence.";
  }
  return "Evidence for this review has already been processed.";
}
