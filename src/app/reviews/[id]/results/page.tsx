import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { getFindingDetail, listFindings } from "@/lib/data/findings";
import { formatReviewDate } from "@/lib/dates";
import { summarizeFindings } from "@/lib/engine/evaluate";
import {
  filterFindings,
  parseFindingParam,
  parseResultsFilter,
  policyLabel,
  RESULTS_FILTERS,
  resultLabel,
  resultsFilterLabel,
  resultsHref,
  userLabel,
} from "@/lib/validation/results-filter";

import { getReviewOr404 } from "../load-review";
import { FindingDrawer } from "./finding-drawer";

// Allowed to block: the existence check must run before any streaming starts,
// so a missing or other-company review gets a real HTTP 404, not a streamed 200.
export const instant = false;

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

// Screen 5: Results. ?finding=<id> opens the Screen 6 drawer.
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
  const query = await searchParams;
  const filter = parseResultsFilter(query.filter);
  // A malformed, missing or other-company finding is a 404, same as a review.
  const findingParam = parseFindingParam(query.finding);
  if (findingParam.kind === "invalid") {
    notFound();
  }

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
    if (findingParam.kind === "id") {
      notFound();
    }
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
        {header}
        <p className="text-zinc-600 dark:text-zinc-400">
          The AI policy check hasn&apos;t been run for this review yet.
        </p>
      </main>
    );
  }

  const [findings, openFinding] = await Promise.all([
    listFindings(user.companyId, review.id),
    findingParam.kind === "id"
      ? getFindingDetail(user.companyId, review.id, findingParam.id)
      : Promise.resolve(null),
  ]);
  if (!findings || (findingParam.kind === "id" && !openFinding)) {
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
                <tr
                  key={finding.id}
                  aria-current={openFinding?.id === finding.id ? "true" : undefined}
                  className="border-b border-zinc-100 align-top aria-[current=true]:bg-zinc-100 dark:border-zinc-900 dark:aria-[current=true]:bg-zinc-900"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={resultsHref(review.id, filter, finding.id)}
                      scroll={false}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {finding.appName}
                    </Link>
                    {finding.appId ? <div className="text-xs text-zinc-500">{finding.appId}</div> : null}
                  </td>
                  <td className="py-2 pr-4">{userLabel(finding.userEmail)}</td>
                  <td className="py-2 pr-4">{finding.observedPermission}</td>
                  <td className="py-2 pr-4">{policyLabel(finding.policyRuleSnapshot)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {resultLabel[finding.result]}
                    {finding.resolutionStatus === "RESOLVED" ? (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                        Resolved
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">{finding.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openFinding ? (
        <FindingDrawer
          reviewId={review.id}
          reviewStatus={review.status}
          filter={filter}
          finding={openFinding}
        />
      ) : null}
    </main>
  );
}
