// Display labels for a policy rule or a finding's rule snapshot (same fields).
// Pure: used by the policy page, the finding drawer and the compliance report.
import type { ApprovalStatus, PolicyRuleInput } from "./validation/policy-rule";

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  APPROVED: "Approved",
  CONDITIONAL: "Conditional",
  PROHIBITED: "Prohibited",
};

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "None";
}

export function describePopulation(
  rule: Pick<
    PolicyRuleInput,
    "approvalStatus" | "approvedForAll" | "approvedDepartments" | "approvedUsers"
  >,
): string {
  if (rule.approvalStatus === "PROHIBITED") return "None";
  if (rule.approvedForAll) return "All";
  return [...rule.approvedDepartments, ...rule.approvedUsers].join(", ") || "None";
}

export function describeAllowed(
  rule: Pick<PolicyRuleInput, "allPermissionsAllowed" | "allowedPermissions">,
): string {
  return rule.allPermissionsAllowed ? "All" : listOrNone(rule.allowedPermissions);
}

export function describeProhibited(
  rule: Pick<PolicyRuleInput, "allPermissionsProhibited" | "prohibitedPermissions">,
): string {
  return rule.allPermissionsProhibited ? "All" : listOrNone(rule.prohibitedPermissions);
}
