"use client";

import { useRef, useState, useTransition, type SubmitEvent } from "react";

import { uploadWithSignedUrl, type StartUploadResponse } from "@/lib/supabase/signed-upload";
import { KIND_ACCEPT, parseStartUpload } from "@/lib/validation/review-file";

import type { ConvertedUploadResult } from "./actions";

// Saves CSV text (already formula-neutralized by buildErrorCsv) as a file.
function downloadCsv(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

// Always rendered, so the result stays visible after the page refreshes into
// EVIDENCE_VALIDATED (when the file input is replaced by blockedMessage).
export function ConvertedEvidenceUpload({
  start,
  finalize,
  blockedMessage,
}: {
  start: (input: { fileName: string; size: number }) => Promise<StartUploadResponse>;
  finalize: (input: { path: string; fileName: string }) => Promise<ConvertedUploadResult>;
  blockedMessage: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertedUploadResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setResult(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    const check = parseStartUpload({ kind: "converted_evidence", fileName: file.name, size: file.size });
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
        if (finalized.ok || finalized.validation) {
          setResult(finalized);
        } else {
          setError(finalized.error);
        }
        if (finalized.ok) form.reset();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {blockedMessage ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{blockedMessage}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept={KIND_ACCEPT.converted_evidence}
            disabled={pending}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm dark:file:border-zinc-700"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Validating…" : "Upload and Validate"}
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="flex flex-col items-start gap-1 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-900 dark:bg-green-950">
          <span className="font-medium text-green-800 dark:text-green-300">
            {plural(result.rowCount, "application-access record", "application-access records")}{" "}
            imported successfully
          </span>
          <span className="text-green-800 dark:text-green-300">
            {plural(result.duplicateCount, "duplicate row", "duplicate rows")} ignored
          </span>
          {result.duplicatesCsv ? (
            <button
              type="button"
              onClick={() => downloadCsv(result.duplicatesCsv ?? "", "evidence-duplicates.csv")}
              className="mt-1 text-sm underline-offset-2 hover:underline"
            >
              Download Duplicate List
            </button>
          ) : null}
        </div>
      ) : null}

      {result && !result.ok && result.validation ? (
        <ValidationErrors message={result.error} validation={result.validation} />
      ) : null}
    </div>
  );
}

function ValidationErrors({
  message,
  validation,
}: {
  message: string;
  validation: NonNullable<Extract<ConvertedUploadResult, { ok: false }>["validation"]>;
}) {
  const { totalErrors, errors, errorCsv } = validation;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {message} Nothing was imported.
        </p>
        <button
          type="button"
          onClick={() => downloadCsv(errorCsv, "evidence-errors.csv")}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
        >
          Download Error File
        </button>
      </div>
      {errors.length < totalErrors ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Showing the first {errors.length.toLocaleString("en-US")} of{" "}
          {totalErrors.toLocaleString("en-US")} errors. The error file lists all of them.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Row</th>
              <th className="py-2 pr-4 font-medium">Column</th>
              <th className="py-2 pr-4 font-medium">Problem</th>
              <th className="py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((item, index) => (
              <tr key={index} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                <td className="py-2 pr-4 whitespace-nowrap">{item.rowNumber ?? "File"}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{item.column ?? "—"}</td>
                <td className="py-2 pr-4">{item.message}</td>
                <td className="py-2 font-mono text-xs break-all">{item.value ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
