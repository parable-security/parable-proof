import Link from "next/link";

import type { FindingDetail } from "@/lib/data/findings";
import { formatInstantDate, formatTimestamp } from "@/lib/dates";
import {
  approvalStatusLabel,
  describeAllowed,
  describePopulation,
  describeProhibited,
} from "@/lib/rule-display";
import {
  matchedByLabel,
  parsePolicyRuleSnapshot,
  resultLabel,
  type ResultsFilter,
  resultsHref,
  userLabel,
} from "@/lib/validation/results-filter";

import { addFindingNoteAction, resolveFindingAction } from "./actions";
import { AddNoteForm } from "./add-note-form";
import { ResolveFindingForm } from "./resolve-finding-form";

function Fields({ rows }: { rows: [label: string, value: string | number][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-zinc-500">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

const linkClass = "text-sm font-medium underline";

// Screen 6: Exception Detail. Server-rendered; opened by ?finding=<id>.
export function FindingDrawer({
  reviewId,
  reviewStatus,
  filter,
  finding,
}: {
  reviewId: string;
  reviewStatus: "RESULTS_READY" | "FINALIZED";
  filter: ResultsFilter;
  finding: FindingDetail;
}) {
  const closeHref = resultsHref(reviewId, filter);
  const rule = parsePolicyRuleSnapshot(finding.policyRuleSnapshot);
  const { evidence } = finding;
  const editable = reviewStatus === "RESULTS_READY";
  const resolvable =
    editable && finding.resolutionStatus === "OPEN" && finding.result !== "COMPLIANT";
  const policyHref = `/reviews/${reviewId}/policy`;
  const addRuleHref = `${policyHref}/rules/new?${new URLSearchParams({
    appName: evidence.appName,
    appId: evidence.appId,
  })}`;

  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-10 bg-black/30"
      />
      <aside
        role="dialog"
        aria-labelledby="finding-drawer-title"
        className="fixed inset-y-0 right-0 z-20 flex w-full max-w-lg flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="finding-drawer-title" className="text-xl font-semibold">
              {finding.appName}
            </h2>
            <p className="text-sm">
              <span className="text-zinc-500">Result:</span>{" "}
              <span className="font-medium">{resultLabel[finding.result]}</span>
              {finding.resolutionStatus === "RESOLVED" ? (
                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                  Resolved
                </span>
              ) : null}
            </p>
          </div>
          <Link href={closeHref} scroll={false} className={linkClass}>
            Close
          </Link>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Why</span>
          <p>{finding.reason}</p>
        </div>

        <Section title="Evidence">
          <Fields
            rows={[
              ["User", userLabel(evidence.userEmail)],
              ["Application", evidence.appName],
              ["Application ID", evidence.appId],
              ["Permission", evidence.permissionScope],
              ["Consent", evidence.consentType],
              ["Resource", evidence.resourceName],
              ["Observed", formatInstantDate(evidence.observedAt)],
              ["Evidence row", evidence.rowNumber],
            ]}
          />
        </Section>

        <Section title="Policy rule">
          {rule ? (
            <>
              <p className="text-sm font-medium">{rule.appName}</p>
              <Fields
                rows={[
                  ["Status", approvalStatusLabel[rule.approvalStatus]],
                  ["Approved users", describePopulation(rule)],
                  ["Allowed permissions", describeAllowed(rule)],
                  ["Prohibited permissions", describeProhibited(rule)],
                  ["Matched by", matchedByLabel[rule.matchedBy]],
                ]}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No policy rule</p>
          )}
        </Section>

        {finding.resolutionStatus === "RESOLVED" ? (
          <Section title="Resolution">
            <p className="text-sm whitespace-pre-wrap">{finding.resolutionNote}</p>
            <Fields
              rows={[
                ["Resolved by", finding.resolvedBy ?? ""],
                ["Recorded account", finding.resolvedByAccountName ?? ""],
                ["Resolved at", finding.resolvedAt ? formatTimestamp(finding.resolvedAt) : ""],
              ]}
            />
          </Section>
        ) : null}

        <Section title="Notes">
          {finding.notes.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No notes yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {finding.notes.map((note) => (
                <li key={note.id} className="flex flex-col gap-0.5 text-sm">
                  <p className="whitespace-pre-wrap">{note.note}</p>
                  <p className="text-xs text-zinc-500">
                    {note.authorName} · {formatTimestamp(note.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {editable ? (
            <AddNoteForm action={addFindingNoteAction.bind(null, reviewId, finding.id)} />
          ) : null}
        </Section>

        {editable ? (
          <>
            {resolvable ? (
              <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <ResolveFindingForm action={resolveFindingAction.bind(null, reviewId, finding.id)} />
              </section>
            ) : null}

            <Section title="Update Policy">
              {finding.ruleState === "active" && finding.policyRuleId ? (
                <>
                  <Link
                    href={`${policyHref}/rules/${finding.policyRuleId}/edit`}
                    className={linkClass}
                  >
                    Update Policy
                  </Link>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Editing the rule doesn&apos;t change this finding. It applies to the next review.
                  </p>
                </>
              ) : finding.ruleState === "deleted" ? (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    The policy rule behind this finding has been deleted.
                  </p>
                  <Link href={policyHref} className={linkClass}>
                    Go to policy rules
                  </Link>
                </>
              ) : (
                <Link href={addRuleHref} className={linkClass}>
                  Add a policy rule for this app
                </Link>
              )}
            </Section>
          </>
        ) : (
          <p className="border-t border-zinc-200 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            This review is finalized.
          </p>
        )}
      </aside>
    </>
  );
}
