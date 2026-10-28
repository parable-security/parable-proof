"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";

import type { DownloadUrlResult } from "@/app/_components/file-download-button";
import { requireRole } from "@/lib/auth/require-user";
import { getReviewScopeForStaff } from "@/lib/data/staff";
import {
  createDownloadUrl,
  createUpload,
  finalizeConvertedEvidence,
  type StorageFailure,
} from "@/lib/storage/review-files";
import type { StartUploadResponse } from "@/lib/supabase/signed-upload";
import { buildErrorCsv, type EvidenceCsvError } from "@/lib/validation/evidence-csv";
import { fileKindSchema } from "@/lib/validation/review-file";

// Staff actions. Every argument comes from the client and is untrusted. Each
// action checks the role first, then looks up the review's company from the
// database; no companyId is ever accepted from or sent to the client.

const MAX_ERRORS_SHOWN = 100;

export type ConvertedUploadResult =
  | { ok: true; rowCount: number; duplicateCount: number; duplicatesCsv: string | null }
  | {
      ok: false;
      error: string;
      validation?: { totalErrors: number; errors: EvidenceCsvError[]; errorCsv: string };
    };

const startInputSchema = z.object({ fileName: z.string(), size: z.number() });
const finalizeInputSchema = z.object({ path: z.string(), fileName: z.string() });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

async function requireStaffScope(reviewId: string) {
  const user = await requireRole("parable_staff");
  const scope = await getReviewScopeForStaff(reviewId);
  if (!scope) notFound();
  return { user, scope };
}

function failure(result: StorageFailure): { ok: false; error: string } {
  if (result.error === "NOT_FOUND") notFound();
  return { ok: false, error: result.message };
}

export async function staffDownloadUrlAction(
  reviewId: string,
  kind: string,
): Promise<DownloadUrlResult> {
  const { scope } = await requireStaffScope(reviewId);
  const parsedKind = fileKindSchema.safeParse(kind);
  if (!parsedKind.success) return { ok: false, error: "Invalid download request." };

  const result = await createDownloadUrl(scope.companyId, scope.reviewId, parsedKind.data);
  if (!result.ok) return failure(result);
  return result;
}

export async function startConvertedUploadAction(
  reviewId: string,
  input: { fileName: string; size: number },
): Promise<StartUploadResponse> {
  const { scope } = await requireStaffScope(reviewId);
  const parsed = startInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload request." };

  const result = await createUpload(
    scope.companyId,
    scope.reviewId,
    "converted_evidence",
    parsed.data.fileName,
    parsed.data.size,
  );
  if (!result.ok) return failure(result);
  return result;
}

// expectedRawExportSha256 is bound by the page: the raw export staff downloaded.
export async function finalizeConvertedUploadAction(
  reviewId: string,
  expectedRawExportSha256: string,
  input: { path: string; fileName: string },
): Promise<ConvertedUploadResult> {
  const { user, scope } = await requireStaffScope(reviewId);
  const parsedSha = sha256Schema.safeParse(expectedRawExportSha256);
  const parsedInput = finalizeInputSchema.safeParse(input);
  if (!parsedSha.success || !parsedInput.success) {
    return { ok: false, error: "Invalid upload request." };
  }

  const result = await finalizeConvertedEvidence(
    scope.companyId,
    scope.reviewId,
    user.userId,
    parsedInput.data.path,
    parsedInput.data.fileName,
    parsedSha.data,
  );

  if (!result.ok) {
    if (result.error !== "INVALID_EVIDENCE") return failure(result);
    const totalErrors = result.errors.length;
    return {
      ok: false,
      error: `The converted file has ${totalErrors.toLocaleString("en-US")} ${totalErrors === 1 ? "error" : "errors"}.`,
      validation: {
        totalErrors,
        errors: result.errors.slice(0, MAX_ERRORS_SHOWN),
        errorCsv: buildErrorCsv({ errors: result.errors }),
      },
    };
  }

  refresh();
  return {
    ok: true,
    rowCount: result.rowCount,
    duplicateCount: result.duplicateCount,
    duplicatesCsv:
      result.duplicateCount > 0 ? buildErrorCsv({ duplicates: result.duplicates }) : null,
  };
}
