"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/require-user";
import {
  createDownloadUrl,
  createUpload,
  finalizeUpload,
  type StorageFailure,
} from "@/lib/storage/review-files";
import { fileKindSchema } from "@/lib/validation/review-file";

// Uploads go straight from the browser to Supabase Storage:
// startUploadAction (signed URL) → browser upload → finalizeUploadAction.
// Every argument comes from the client and is untrusted; companyId and userId
// come only from requireRole().

export type FileActionResult = { ok: true } | { ok: false; error: string };

export type StartUploadResult =
  | { ok: true; path: string; token: string; contentType: string }
  | { ok: false; error: string };

export type DownloadUrlResult = { ok: true; url: string } | { ok: false; error: string };

const INVALID_REQUEST = { ok: false, error: "Invalid upload request." } as const;

const startInputSchema = z.object({ fileName: z.string(), size: z.number() });
const finalizeInputSchema = z.object({ path: z.string(), fileName: z.string() });

// NOT_FOUND covers a missing review and another company's review alike.
function failure(result: StorageFailure): { ok: false; error: string } {
  if (result.error === "NOT_FOUND") notFound();
  return { ok: false, error: result.message };
}

export async function startUploadAction(
  reviewId: string,
  kind: string,
  input: { fileName: string; size: number },
): Promise<StartUploadResult> {
  const user = await requireRole("customer_admin");
  const parsedKind = fileKindSchema.safeParse(kind);
  const parsedInput = startInputSchema.safeParse(input);
  if (!parsedKind.success || !parsedInput.success) return INVALID_REQUEST;

  const result = await createUpload(
    user.companyId,
    reviewId,
    parsedKind.data,
    parsedInput.data.fileName,
    parsedInput.data.size,
  );
  if (!result.ok) return failure(result);
  return result;
}

export async function finalizeUploadAction(
  reviewId: string,
  kind: string,
  input: { path: string; fileName: string },
): Promise<FileActionResult> {
  const user = await requireRole("customer_admin");
  const parsedKind = fileKindSchema.safeParse(kind);
  const parsedInput = finalizeInputSchema.safeParse(input);
  if (!parsedKind.success || !parsedInput.success) return INVALID_REQUEST;

  const result = await finalizeUpload(
    user.companyId,
    reviewId,
    user.userId,
    parsedKind.data,
    parsedInput.data.path,
    parsedInput.data.fileName,
  );
  if (!result.ok) return failure(result);
  refresh();
  return { ok: true };
}

export async function downloadUrlAction(reviewId: string, kind: string): Promise<DownloadUrlResult> {
  const user = await requireRole("customer_admin");
  const parsedKind = fileKindSchema.safeParse(kind);
  if (!parsedKind.success) return { ok: false, error: "Invalid download request." };

  const result = await createDownloadUrl(user.companyId, reviewId, parsedKind.data);
  if (!result.ok) return failure(result);
  return result;
}
