"use client";

import { useRef, useState, useTransition, type SubmitEvent } from "react";

import { uploadWithSignedUrl } from "@/lib/supabase/signed-upload";
import { KIND_ACCEPT, parseStartUpload, type FileKind } from "@/lib/validation/review-file";

import type { FileActionResult, StartUploadResult } from "./file-actions";

// Uploads straight to Supabase Storage with a one-time signed URL, then asks
// the server to verify and record the file. The checks here are for UX only;
// the server repeats all of them.
export function FileUpload({
  kind,
  start,
  finalize,
  submitLabel,
}: {
  kind: FileKind;
  start: (input: { fileName: string; size: number }) => Promise<StartUploadResult>;
  finalize: (input: { path: string; fileName: string }) => Promise<FileActionResult>;
  submitLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setMessage(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    const check = parseStartUpload({ kind, fileName: file.name, size: file.size });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    startTransition(async () => {
      try {
        const uploaded = await uploadWithSignedUrl(file, start);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        const finalized = await finalize({ path: uploaded.path, fileName: file.name });
        if (!finalized.ok) {
          setError(finalized.error);
          return;
        }
        form.reset();
        setMessage(`Uploaded ${check.data.fileName}.`);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={KIND_ACCEPT[kind]}
        disabled={pending}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm dark:file:border-zinc-700"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Uploading…" : submitLabel}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-green-700 dark:text-green-400">{message}</p> : null}
    </form>
  );
}
