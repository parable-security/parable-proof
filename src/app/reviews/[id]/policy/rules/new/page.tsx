import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";

import { getReviewOr404 } from "../../../load-review";
import { createRuleAction } from "../../actions";
import { RuleForm } from "../../rule-form";

// Allowed to block, so a missing or other-company review is a real 404.
export const instant = false;

export default async function NewRulePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("customer_admin");
  const { id } = await params;
  const review = await getReviewOr404(user.companyId, id);
  const policyHref = `/reviews/${review.id}/policy`;
  if (review.status === "FINALIZED") {
    redirect(policyHref);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">{review.reviewName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Add AI Application</h1>
      </div>
      <RuleForm
        action={createRuleAction.bind(null, review.id)}
        initialValues={{ approvalStatus: "CONDITIONAL" }}
        cancelHref={policyHref}
        submitLabel="Add rule"
      />
    </main>
  );
}
