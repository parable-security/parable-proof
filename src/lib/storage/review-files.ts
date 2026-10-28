import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { importEvidence } from "@/lib/data/evidence";
import { getReviewFiles, setReviewFile, type ReviewFiles } from "@/lib/data/reviews";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseEvidenceCsv,
  type DuplicateRow,
  type EvidenceCsvError,
} from "@/lib/validation/evidence-csv";
import {
  buildStoragePath,
  checkFileContent,
  isExpectedStoragePath,
  parseFileName,
  parseStartUpload,
  REVIEW_FILE_BUCKET,
  storagePathExtension,
  uploadBlockedMessage,
  type CustomerFileKind,
  type FileKind,
} from "@/lib/validation/review-file";

// Private review files in Supabase Storage. Every function takes companyId and
// reviewId first and checks the review belongs to the company before touching
// storage. Paths are built here only; a path from the browser is re-checked.

const DOWNLOAD_URL_SECONDS = 60;

const RAW_EXPORT_CHANGED_MESSAGE =
  "The customer replaced the Microsoft export. Download it again and re-convert.";

export type StorageFailure =
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "REJECTED"; message: string };

const NOT_FOUND: StorageFailure = { ok: false, error: "NOT_FOUND" };

function rejected(message: string): StorageFailure {
  return { ok: false, error: "REJECTED", message };
}

function bucket() {
  return createAdminClient().storage.from(REVIEW_FILE_BUCKET);
}

function storedFile(review: ReviewFiles, kind: FileKind) {
  switch (kind) {
    case "policy_document":
      return review.policyDocument;
    case "raw_export":
      return review.rawExport;
    case "converted_evidence":
      return review.convertedEvidence;
  }
}

// Downloads a freshly uploaded object and checks its real size and content.
async function readUploadedFile(
  kind: FileKind,
  path: string,
  ext: string,
): Promise<{ ok: true; bytes: Uint8Array; sha256: string } | StorageFailure> {
  const { data: blob, error } = await bucket().download(path);
  if (error || !blob) {
    return rejected("The upload did not complete. Try again.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const content = checkFileContent(kind, ext, bytes);
  if (!content.ok) return rejected(content.error);
  return { ok: true, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

// Best effort: a failed delete leaves an unreferenced private object.
async function removeObject(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) {
    console.error(`review-files: could not delete ${path}: ${error.message}`);
  }
}

// Step 1: a one-time signed upload URL for a new object.
export async function createUpload(
  companyId: string,
  reviewId: string,
  kind: FileKind,
  fileName: string,
  size: number,
): Promise<{ ok: true; path: string; token: string; contentType: string } | StorageFailure> {
  const review = await getReviewFiles(companyId, reviewId);
  if (!review) return NOT_FOUND;

  const request = parseStartUpload({ kind, fileName, size });
  if (!request.ok) return rejected(request.error);
  const blocked = uploadBlockedMessage(kind, review.status);
  if (blocked) return rejected(blocked);

  const path = buildStoragePath(companyId, review.id, kind, randomUUID(), request.data.ext);
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
  if (error) {
    console.error(`review-files: could not create upload URL for ${path}: ${error.message}`);
    return rejected("Could not start the upload. Try again.");
  }
  return { ok: true, path, token: data.token, contentType: request.data.contentType };
}

// Step 3 (after the browser uploads): verify the stored object and record it
// on the review. On any failure after the path check, the new object is deleted.
export async function finalizeUpload(
  companyId: string,
  reviewId: string,
  userId: string,
  kind: CustomerFileKind,
  path: string,
  fileName: string,
): Promise<{ ok: true } | StorageFailure> {
  const review = await getReviewFiles(companyId, reviewId);
  if (!review) return NOT_FOUND;

  // The path is untrusted. Until it is exactly one we could have issued for
  // this company, review and kind, nothing is read or deleted.
  if (!isExpectedStoragePath(path, companyId, review.id, kind)) {
    return rejected("The upload could not be verified. Try again.");
  }
  // A replayed finalize of the current file must not delete it on a later failure.
  if (storedFile(review, kind)?.storagePath === path) {
    return rejected("This file is already saved.");
  }

  let result: { ok: true; previousPath: string | null } | StorageFailure;
  try {
    result = await verifyAndRecord(companyId, review, userId, kind, path, fileName);
  } catch (error) {
    await removeObject(path);
    throw error;
  }
  if (!result.ok) {
    await removeObject(path);
    return result;
  }

  // Replaced file: delete the old object only after the review points at the new one.
  if (result.previousPath && result.previousPath !== path) {
    await removeObject(result.previousPath);
  }
  return { ok: true };
}

async function verifyAndRecord(
  companyId: string,
  review: ReviewFiles,
  userId: string,
  kind: CustomerFileKind,
  path: string,
  fileName: string,
): Promise<{ ok: true; previousPath: string | null } | StorageFailure> {
  const name = parseFileName(fileName);
  if (!name.ok) return rejected(name.error);
  if (name.ext !== storagePathExtension(path)) {
    return rejected("The file name does not match the uploaded file.");
  }
  const blocked = uploadBlockedMessage(kind, review.status);
  if (blocked) return rejected(blocked);

  const file = await readUploadedFile(kind, path, name.ext);
  if (!file.ok) return file;

  const saved = await setReviewFile(companyId, review.id, userId, kind, {
    fileName: name.fileName,
    storagePath: path,
    sha256: file.sha256,
  });
  if (!saved.ok) {
    return saved.error === "NOT_FOUND"
      ? NOT_FOUND
      : rejected("This review's status changed. Reload the page and try again.");
  }
  return { ok: true, previousPath: saved.previousPath };
}

export type ConvertedEvidenceResult =
  | { ok: true; rowCount: number; duplicateCount: number; duplicates: DuplicateRow[] }
  | { ok: false; error: "INVALID_EVIDENCE"; errors: EvidenceCsvError[] }
  | StorageFailure;

// Staff step 3: verify the converted evidence CSV, validate it, and import it.
// expectedRawExportSha256 is the raw export staff converted; if the customer
// has replaced it since, nothing is imported. On any failure after the path
// check, the uploaded object is deleted; an invalid file writes nothing.
export async function finalizeConvertedEvidence(
  companyId: string,
  reviewId: string,
  userId: string,
  path: string,
  fileName: string,
  expectedRawExportSha256: string,
): Promise<ConvertedEvidenceResult> {
  const review = await getReviewFiles(companyId, reviewId);
  if (!review) return NOT_FOUND;

  // Untrusted path: nothing is read or deleted unless it is one we could have issued.
  if (!isExpectedStoragePath(path, companyId, review.id, "converted_evidence")) {
    return rejected("The upload could not be verified. Try again.");
  }
  if (review.convertedEvidence?.storagePath === path) {
    return rejected("This file is already saved.");
  }

  let result: ConvertedEvidenceResult;
  try {
    result = await validateAndImport(
      companyId,
      review,
      userId,
      path,
      fileName,
      expectedRawExportSha256,
    );
  } catch (error) {
    await removeObject(path);
    throw error;
  }
  if (!result.ok) await removeObject(path);
  return result;
}

async function validateAndImport(
  companyId: string,
  review: ReviewFiles,
  userId: string,
  path: string,
  fileName: string,
  expectedRawExportSha256: string,
): Promise<ConvertedEvidenceResult> {
  const name = parseFileName(fileName);
  if (!name.ok) return rejected(name.error);
  if (name.ext !== storagePathExtension(path)) {
    return rejected("The file name does not match the uploaded file.");
  }
  const blocked = uploadBlockedMessage("converted_evidence", review.status);
  if (blocked) return rejected(blocked);
  if (review.rawExport?.sha256 !== expectedRawExportSha256) {
    return rejected(RAW_EXPORT_CHANGED_MESSAGE);
  }

  const file = await readUploadedFile("converted_evidence", path, name.ext);
  if (!file.ok) return file;

  const parsed = parseEvidenceCsv(file.bytes);
  if (!parsed.ok) return { ok: false, error: "INVALID_EVIDENCE", errors: parsed.errors };

  const imported = await importEvidence(
    companyId,
    review.id,
    userId,
    { fileName: name.fileName, storagePath: path, sha256: file.sha256 },
    expectedRawExportSha256,
    parsed,
  );
  if (!imported.ok) {
    if (imported.error === "NOT_FOUND") return NOT_FOUND;
    if (imported.error === "RAW_EXPORT_CHANGED") return rejected(RAW_EXPORT_CHANGED_MESSAGE);
    return rejected("This review's status changed. Reload the page.");
  }
  return {
    ok: true,
    rowCount: parsed.rowCount,
    duplicateCount: parsed.duplicateCount,
    duplicates: parsed.duplicates,
  };
}

// A short-lived download link. The path comes from the review row, never the browser.
export async function createDownloadUrl(
  companyId: string,
  reviewId: string,
  kind: FileKind,
): Promise<{ ok: true; url: string } | StorageFailure> {
  const review = await getReviewFiles(companyId, reviewId);
  if (!review) return NOT_FOUND;

  const file = storedFile(review, kind);
  if (!file || !isExpectedStoragePath(file.storagePath, companyId, review.id, kind)) {
    return rejected("No file has been uploaded.");
  }
  const { data, error } = await bucket().createSignedUrl(file.storagePath, DOWNLOAD_URL_SECONDS, {
    download: file.fileName,
  });
  if (error) {
    console.error(`review-files: could not sign ${file.storagePath}: ${error.message}`);
    return rejected("Could not create a download link. Try again.");
  }
  return { ok: true, url: data.signedUrl };
}
