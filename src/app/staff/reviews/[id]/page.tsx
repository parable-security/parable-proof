import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { FileDownloadButton } from "@/app/_components/file-download-button";
import { reviewStatusLabel } from "@/app/reviews/status-label";
import { requireRole } from "@/lib/auth/require-user";
import { getReview, getReviewFiles } from "@/lib/data/reviews";
import { getReviewScopeForStaff } from "@/lib/data/staff";
import { formatTimestamp } from "@/lib/dates";
import { uploadBlockedMessage } from "@/lib/validation/review-file";

import {
  finalizeConvertedUploadAction,
  startConvertedUploadAction,
  staffDownloadUrlAction,
} from "./actions";
import { ConvertedEvidenceUpload } from "./converted-evidence-upload";

// Allowed to block: the existence check must run before any streaming starts,
// so an unknown review gets a real HTTP 404, not a streamed 200.
export const instant = false;

// Staff view of one review: download the customer's files, upload the converted evidence.
export default async function StaffReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("parable_staff");
  const { id } = await params;
  // The company comes from the database, never from the client.
  const scope = await getReviewScopeForStaff(id);
  if (!scope) {
    notFound();
  }
  const review = await getReview(scope.companyId, scope.reviewId);
  const files = await getReviewFiles(scope.companyId, scope.reviewId);
  if (!review || !files) {
    notFound();
  }

  const { policyDocument, rawExport, convertedEvidence, report } = files;
  const download = (kind: "policy_document" | "raw_export" | "converted_evidence" | "report") =>
    staffDownloadUrlAction.bind(null, review.id, kind);

  const blockedMessage =
    uploadBlockedMessage("converted_evidence", review.status) ??
    (rawExport?.sha256 ? null : "Waiting for the customer's Microsoft export.");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <Link href="/staff" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← All reviews
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">{scope.companyName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{review.reviewName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Status: {reviewStatusLabel[review.status]}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Customer Files</h2>
        <FileRow label="Policy document" missing="Not uploaded.">
          {policyDocument ? (
            <>
              <span className="font-medium">{policyDocument.fileName}</span>
              <UploadedAt at={policyDocument.uploadedAt} />
              <FileDownloadButton action={download("policy_document")} />
            </>
          ) : null}
        </FileRow>
        <FileRow label="Microsoft export" missing="Not uploaded.">
          {rawExport ? (
            <>
              <span className="font-medium">{rawExport.fileName}</span>
              <UploadedAt at={rawExport.uploadedAt} />
              <FileDownloadButton action={download("raw_export")} />
              {rawExport.sha256 ? <Sha256 value={rawExport.sha256} /> : null}
            </>
          ) : null}
        </FileRow>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Converted Evidence</h2>
        {convertedEvidence ? (
          <FileRow label="Evidence CSV" missing="">
            <span className="font-medium">{convertedEvidence.fileName}</span>
            <UploadedAt at={convertedEvidence.uploadedAt} />
            <FileDownloadButton action={download("converted_evidence")} />
            <span className="w-full text-zinc-600 dark:text-zinc-400">
              {(convertedEvidence.rowCount ?? 0).toLocaleString("en-US")} records imported,{" "}
              {(convertedEvidence.duplicateCount ?? 0).toLocaleString("en-US")} duplicate rows
              ignored.
            </span>
            {convertedEvidence.sha256 ? <Sha256 value={convertedEvidence.sha256} /> : null}
          </FileRow>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Convert the Microsoft export into the evidence CSV format, then upload it here. The
            file is validated before anything is imported.
          </p>
        )}
        <ConvertedEvidenceUpload
          start={startConvertedUploadAction.bind(null, review.id)}
          finalize={finalizeConvertedUploadAction.bind(null, review.id, rawExport?.sha256 ?? "")}
          blockedMessage={blockedMessage}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Compliance Report</h2>
        <FileRow label="Report PDF" missing="Not finalized yet.">
          {report ? (
            <>
              <span className="font-medium">{report.fileName}</span>
              <UploadedAt at={report.uploadedAt} />
              <FileDownloadButton action={download("report")} />
              {report.sha256 ? <Sha256 value={report.sha256} /> : null}
            </>
          ) : null}
        </FileRow>
      </section>
    </main>
  );
}

function FileRow({
  label,
  missing,
  children,
}: {
  label: string;
  missing: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <span className="w-40 shrink-0 text-zinc-500">{label}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {children ?? <span className="text-zinc-600 dark:text-zinc-400">{missing}</span>}
      </div>
    </div>
  );
}

function UploadedAt({ at }: { at: Date | null }) {
  return at ? <span className="text-zinc-600 dark:text-zinc-400">{formatTimestamp(at)}</span> : null;
}

function Sha256({ value }: { value: string }) {
  return <span className="w-full font-mono text-xs break-all text-zinc-500">SHA-256: {value}</span>;
}
