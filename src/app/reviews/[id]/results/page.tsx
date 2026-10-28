import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { listFindings } from "@/lib/data/findings";
import { formatReviewDate } from "@/lib/dates";
import { summarizeFindings } from "@/lib/engine/evaluate";
import {
  filterFindings,
  parseResultsFilter,
  policyLabel,
  RESULTS_FILTERS,
  resultLabel,
  resultsFilterLabel,
  userLabel,
} from "@/lib/validation/results-filter";

import { getReviewOr404 } from "../load-review";

// Allowed to block: the existence check must run before any streaming starts,
// so a missing or other-company review gets a real HTTP 404, not a streamed 200.
export const instant = false;

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

// Screen 5: Results.
export default async function ReviewResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireRole("customer_admin");
  const { id } = await params;
  const review = await getReviewOr404(user.companyId, id);
  const filter = parseResultsFilter((await searchParams).filter);

  const header = (
    <>
      <Link
        href={`/reviews/${review.id}/evidence`}
        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Step 2: Add Microsoft Evidence
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">{review.reviewName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">AI Policy Check</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {formatReviewDate(review.reviewDate)}
        </p>
      </div>
    </>
  );

  if (review.status !== "RESULTS_READY" && review.status !== "FINALIZED") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
        {header}
        <p className="text-zinc-600 dark:text-zinc-400">
          The AI policy check hasn&apos;t been run for this review yet.
        </p>
      </main>
    );
  }

  const findings = await listFindings(user.companyId, review.id);
  if (!findings) {
    notFound();
  }
  const summary = summarizeFindings(findings);
  const shown = filterFindings(findings, filter);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      {header}

      <p className="text-zinc-700 dark:text-zinc-300">
        {plural(summary.applications, "AI application", "AI applications")} reviewed.{" "}
        {summary.compliant.toLocaleString("en-US")} compliant.{" "}
        {plural(summary.exceptions, "policy exception", "policy exceptions")}.{" "}
        {plural(summary.reviewRequired, "requires review", "require review")}.
      </p>

      <nav aria-label="Filter results" className="flex flex-wrap gap-2">
        {RESULTS_FILTERS.map((value) => (
          <Link
            key={value}
            href={
              value === "all"
                ? `/reviews/${review.id}/results`
                : `/reviews/${review.id}/results?filter=${value}`
            }
            aria-current={value === filter ? "page" : undefined}
            className={
              value === filter
                ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
            }
          >
            {resultsFilterLabel[value]}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {findings.length === 0 ? "No AI applications were found in this evidence." : "No findings match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">Application</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Permission</th>
                <th className="py-2 pr-4 font-medium">Policy</th>
                <th className="py-2 pr-4 font-medium">Result</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((finding) => (
                <tr key={finding.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{finding.appName}</div>
                    {finding.appId ? <div className="text-xs text-zinc-500">{finding.appId}</div> : null}
                  </td>
                  <td className="py-2 pr-4">{userLabel(finding.userEmail)}</td>
                  <td className="py-2 pr-4">{finding.observedPermission}</td>
                  <td className="py-2 pr-4">{policyLabel(finding.policyRuleSnapshot)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{resultLabel[finding.result]}</td>
                  <td className="py-2">{finding.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
