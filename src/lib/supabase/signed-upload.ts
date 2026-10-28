import { REVIEW_FILE_BUCKET } from "@/lib/validation/review-file";

import { createBrowserStorageClient } from "./browser";

export type StartUploadResponse =
  | { ok: true; path: string; token: string; contentType: string }
  | { ok: false; error: string };

// Browser side of an upload: ask the server for a one-time signed URL, then
// send the file straight to Supabase Storage. The caller finalizes with the path.
export async function uploadWithSignedUrl(
  file: File,
  start: (input: { fileName: string; size: number }) => Promise<StartUploadResponse>,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const started = await start({ fileName: file.name, size: file.size });
  if (!started.ok) return started;

  const { error } = await createBrowserStorageClient()
    .storage.from(REVIEW_FILE_BUCKET)
    .uploadToSignedUrl(started.path, started.token, file, { contentType: started.contentType });
  if (error) return { ok: false, error: "The upload failed. Try again." };
  return { ok: true, path: started.path };
}
