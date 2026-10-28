import Link from "next/link";
import { notFound } from "next/navigation";

import { FileDownloadButton } from "@/app/_components/file-download-button";
import { requireRole } from "@/lib/auth/require-user";
import { getReviewFiles } from "@/lib/data/reviews";
import { formatTimestamp } from "@/lib/dates";
import { isEvidenceValidated, uploadBlockedMessage } from "@/lib/validation/review-file";

import { reviewStatusLabel } from "../../status-label";
import { downloadUrlAction, finalizeUploadAction, startUploadAction } from "../file-actions";
import { FileUpload } from "../file-upload";
import { getReviewOr404 } from "../load-review";
import { runPolicyCheckAction } from "./actions";
import { RunCheckButton } from "./run-check-button";

// Allowed to block: the existence check must run before any streaming starts,
// so a missing or other-company review gets a real HTTP 404, not a streamed 200.
export const instant = false;

// Screen 3: Upload Microsoft Evidence (the raw export, as Microsoft provides it).
export default async function ReviewEvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("customer_admin");
  const { id } = await params;
  const review = await getReviewOr404(user.companyId, id);
  const files = await getReviewFiles(user.companyId, review.id);
  if (!files) {
    notFound();
  }

  const rawExport = files.rawExport;
  const blocked = uploadBlockedMessage("raw_export", review.status);
  // Once staff have imported the converted evidence, the raw export is frozen.
  const imported =
    isEvidenceValidated(review.status) && files.convertedEvidence
      ? files.convertedEvidence.rowCount ?? 0
      : null;
  const canRunCheck = review.status === "EVIDENCE_VALIDATED" || review.status === "RESULTS_READY";
  const resultsReady = review.status === "RESULTS_READY" || review.status === "FINALIZED";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <Link
        href={`/reviews/${review.id}/policy`}
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Step 1: Your Approved AI Policy
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">Step 2 of 3: Add Microsoft Evidence</p>
        <h1 className="text-2xl font-semibold tracking-tight">{review.reviewName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Status: {reviewStatusLabel[review.status]}
        </p>
      </div>

      <p className="text-zinc-700 dark:text-zinc-300">
        Upload evidence showing third-party applications and permissions currently authorized in
        your Microsoft environment.
      </p>

      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium opacity-60 dark:border-zinc-700"
        >
          Download Export Instructions
        </button>
        <span className="text-xs text-zinc-500">Coming soon.</span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Microsoft Export</h2>
        {rawExport ? (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Current file: <span className="font-medium">{rawExport.fileName}</span>
              </span>
              <FileDownloadButton action={downloadUrlAction.bind(null, review.id, "raw_export")} />
            </div>
            {rawExport.uploadedAt ? (
              <span className="text-zinc-600 dark:text-zinc-400">
                Uploaded {formatTimestamp(rawExport.uploadedAt)}
              </span>
            ) : null}
            {rawExport.sha256 ? (
              <span className="font-mono text-xs break-all text-zinc-500">
                SHA-256: {rawExport.sha256}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No evidence uploaded yet.</p>
        )}

        {imported !== null ? (
          <div className="flex flex-col gap-1 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-900 dark:bg-green-950">
            <span className="font-medium text-green-800 dark:text-green-300">
              {imported.toLocaleString("en-US")}{" "}
              {imported === 1 ? "application-access record" : "application-access records"} imported.
            </span>
            <span className="text-green-800 dark:text-green-300">
              Your evidence is ready for the policy check.
            </span>
          </div>
        ) : blocked ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{blocked}</p>
        ) : (
          <FileUpload
            kind="raw_export"
            start={startUploadAction.bind(null, review.id, "raw_export")}
            finalize={finalizeUploadAction.bind(null, review.id, "raw_export")}
            submitLabel={rawExport ? "Replace Microsoft Evidence" : "Upload Microsoft Evidence"}
          />
        )}
        {review.status === "EVIDENCE_SUBMITTED" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Parable will convert and validate your export. You can replace the file until then.
          </p>
        ) : null}
      </section>

      {canRunCheck || resultsReady ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">AI Policy Check</h2>
          {canRunCheck ? (
            <RunCheckButton
              action={runPolicyCheckAction.bind(null, review.id)}
              rerun={review.status === "RESULTS_READY"}
            />
          ) : null}
          {resultsReady ? (
            <Link
              href={`/reviews/${review.id}/results`}
              className="self-start text-sm font-medium underline-offset-2 hover:underline"
            >
              View Results →
            </Link>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
