import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { getActiveRule } from "@/lib/data/policy-rules";

import { getReviewOr404 } from "../../../../load-review";
import { updateRuleAction } from "../../../actions";
import { RuleForm } from "../../../rule-form";
import { ruleToFormFields } from "../../../rule-display";

// Allowed to block, so a missing or other-company review or rule is a real 404.
export const instant = false;

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string; ruleId: string }>;
}) {
  const user = await requireRole("customer_admin");
  const { id, ruleId } = await params;
  const review = await getReviewOr404(user.companyId, id);
  const rule = await getActiveRule(user.companyId, ruleId);
  if (!rule) {
    notFound();
  }
  const policyHref = `/reviews/${review.id}/policy`;
  if (review.status === "FINALIZED") {
    redirect(policyHref);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">{review.reviewName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Edit {rule.appName}</h1>
        {rule.approvedAt ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Saving changes will send this rule back for CCO approval.
          </p>
        ) : null}
      </div>
      <RuleForm
        action={updateRuleAction.bind(null, review.id, rule.id)}
        initialValues={ruleToFormFields(rule)}
        cancelHref={policyHref}
        submitLabel="Save changes"
      />
    </main>
  );
}
