import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { listActiveRules } from "@/lib/data/policy-rules";
import { getReviewFiles } from "@/lib/data/reviews";

import { reviewStatusLabel } from "../../status-label";
import { downloadUrlAction, finalizeUploadAction, startUploadAction } from "../file-actions";
import { FileDownloadButton } from "../file-download-button";
import { FileUpload } from "../file-upload";
import { getReviewOr404 } from "../load-review";
import { approveRulesAction, deleteRuleAction } from "./actions";
import { ApproveRulesButton } from "./approve-button";
import { DeleteRuleButton } from "./delete-rule-button";
import {
  approvalStatusLabel,
  describeAllowed,
  describePopulation,
  describeProhibited,
} from "./rule-display";

// Allowed to block: the existence check must run before any streaming starts,
// so a missing or other-company review gets a real HTTP 404, not a streamed 200.
export const instant = false;

// Screen 2: Your Approved AI Policy (rules belong to the company).
export default async function ReviewPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("customer_admin");
  const { id } = await params;
  const review = await getReviewOr404(user.companyId, id);
  const rules = await listActiveRules(user.companyId);
  const files = await getReviewFiles(user.companyId, review.id);
  if (!files) {
    notFound();
  }

  const editable = review.status !== "FINALIZED";
  const pendingCount = rules.filter((rule) => rule.approvedAt === null).length;
  const rulesApproved = review.status !== "DRAFT" && review.status !== "RULES_PENDING_APPROVAL";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <Link href="/reviews" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← Reviews
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">Step 1 of 3: Your Approved AI Policy</p>
        <h1 className="text-2xl font-semibold tracking-tight">{review.reviewName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Status: {reviewStatusLabel[review.status]}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upload Existing Policy</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Upload your approved AI-use policy (PDF or Word). Parable staff convert it into the
          rules below for you to review.
        </p>
        {files.policyDocument ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Current file: <span className="font-medium">{files.policyDocument.fileName}</span>
            </span>
            <FileDownloadButton action={downloadUrlAction.bind(null, review.id, "policy_document")} />
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No policy document uploaded yet.</p>
        )}
        {editable ? (
          <FileUpload
            kind="policy_document"
            start={startUploadAction.bind(null, review.id, "policy_document")}
            finalize={finalizeUploadAction.bind(null, review.id, "policy_document")}
            submitLabel={files.policyDocument ? "Replace Policy" : "Upload Policy"}
          />
        ) : null}
      </section>

      <h2 className="text-lg font-semibold">Review Your Policy Rules</h2>

      {rules.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No policy rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">AI Application</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Approved Users</th>
                <th className="py-2 pr-4 font-medium">Allowed</th>
                <th className="py-2 pr-4 font-medium">Prohibited</th>
                <th className="py-2 pr-4 font-medium">Approval</th>
                {editable ? <th className="py-2 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{rule.appName}</div>
                    {rule.appId ? <div className="text-xs text-zinc-500">{rule.appId}</div> : null}
                  </td>
                  <td className="py-2 pr-4">{approvalStatusLabel[rule.approvalStatus]}</td>
                  <td className="py-2 pr-4">{describePopulation(rule)}</td>
                  <td className="py-2 pr-4">{describeAllowed(rule)}</td>
                  <td className="py-2 pr-4">{describeProhibited(rule)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {rule.approvedAt ? "Approved" : "Pending approval"}
                  </td>
                  {editable ? (
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/reviews/${review.id}/policy/rules/${rule.id}/edit`}
                          className="text-sm underline-offset-2 hover:underline"
                        >
                          Edit
                        </Link>
                        <DeleteRuleButton
                          action={deleteRuleAction.bind(null, review.id, rule.id)}
                          appName={rule.appName}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable ? (
        <div className="flex flex-col gap-6">
          <Link
            href={`/reviews/${review.id}/policy/rules/new`}
            className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            + Add AI Application
          </Link>
          <ApproveRulesButton
            action={approveRulesAction.bind(null, review.id)}
            pendingCount={pendingCount}
          />
          {rulesApproved ? (
            <Link
              href={`/reviews/${review.id}/evidence`}
              className="self-start text-sm font-medium underline-offset-2 hover:underline"
            >
              Continue to Step 2: Add Microsoft Evidence →
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This review is finalized. Its policy rules are read-only.
        </p>
      )}
    </main>
  );
}
