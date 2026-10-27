"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import {
  approveRules,
  createRule,
  getActiveRule,
  softDeleteRule,
  updateRule,
} from "@/lib/data/policy-rules";
import {
  parsePolicyRuleForm,
  RULE_FIELD_NAMES,
  type RuleFieldErrors,
  type RuleFormFields,
} from "@/lib/validation/policy-rule";

import { getReviewOr404 } from "../load-review";

// Bound arguments (reviewId, ruleId) come from the client and are untrusted:
// every action re-checks them against the signed-in user's company.

export type RuleFormState =
  | { fieldErrors?: RuleFieldErrors; formError?: string; values: RuleFormFields }
  | undefined;

export type MessageState = { error?: string; message?: string } | undefined;

const FINALIZED_MESSAGE = "This review is finalized. Its policy rules can't be changed.";
const DUPLICATE_MESSAGE = "A rule for this application already exists.";

function readRuleFields(formData: FormData): RuleFormFields {
  const fields: RuleFormFields = {};
  for (const name of RULE_FIELD_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

export async function createRuleAction(
  reviewId: string,
  _prevState: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const user = await requireRole("customer_admin");
  const review = await getReviewOr404(user.companyId, reviewId);

  const values = readRuleFields(formData);
  if (review.status === "FINALIZED") {
    return { formError: FINALIZED_MESSAGE, values };
  }
  const parsed = parsePolicyRuleForm(values);
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors, values };
  }

  const result = await createRule(user.companyId, parsed.data);
  if (!result.ok) {
    return { formError: DUPLICATE_MESSAGE, values };
  }
  redirect(`/reviews/${review.id}/policy`);
}

export async function updateRuleAction(
  reviewId: string,
  ruleId: string,
  _prevState: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const user = await requireRole("customer_admin");
  const review = await getReviewOr404(user.companyId, reviewId);
  const rule = await getActiveRule(user.companyId, ruleId);
  if (!rule) {
    notFound();
  }

  const values = readRuleFields(formData);
  if (review.status === "FINALIZED") {
    return { formError: FINALIZED_MESSAGE, values };
  }
  const parsed = parsePolicyRuleForm(values);
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors, values };
  }

  const result = await updateRule(user.companyId, rule.id, parsed.data);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    return { formError: DUPLICATE_MESSAGE, values };
  }
  redirect(`/reviews/${review.id}/policy`);
}

export async function deleteRuleAction(reviewId: string, ruleId: string): Promise<MessageState> {
  const user = await requireRole("customer_admin");
  const review = await getReviewOr404(user.companyId, reviewId);
  if (review.status === "FINALIZED") {
    return { error: FINALIZED_MESSAGE };
  }

  const deleted = await softDeleteRule(user.companyId, ruleId);
  if (!deleted) {
    notFound();
  }
  refresh();
  return undefined;
}

export async function approveRulesAction(reviewId: string): Promise<MessageState> {
  const user = await requireRole("customer_admin");
  const review = await getReviewOr404(user.companyId, reviewId);

  const result = await approveRules(user.companyId, review.id, user.userId);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    if (result.error === "FINALIZED") return { error: "This review is finalized." };
    return { error: "Add at least one rule before approving." };
  }
  refresh();
  return {
    message:
      result.approvedCount === 0
        ? "All rules were already approved."
        : `Approved ${result.approvedCount} ${result.approvedCount === 1 ? "rule" : "rules"}.`,
  };
}
