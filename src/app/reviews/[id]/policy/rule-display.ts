import type { PolicyRule } from "@/lib/data/policy-rules";

export const approvalStatusLabel: Record<PolicyRule["approvalStatus"], string> = {
  APPROVED: "Approved",
  CONDITIONAL: "Conditional",
  PROHIBITED: "Prohibited",
};

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "None";
}

export function describePopulation(rule: PolicyRule): string {
  if (rule.approvalStatus === "PROHIBITED") return "None";
  if (rule.approvedForAll) return "All";
  return [...rule.approvedDepartments, ...rule.approvedUsers].join(", ") || "None";
}

export function describeAllowed(rule: PolicyRule): string {
  return rule.allPermissionsAllowed ? "All" : listOrNone(rule.allowedPermissions);
}

export function describeProhibited(rule: PolicyRule): string {
  return rule.allPermissionsProhibited ? "All" : listOrNone(rule.prohibitedPermissions);
}

// Initial form values for editing an existing rule.
export function ruleToFormFields(rule: PolicyRule) {
  return {
    appName: rule.appName,
    appId: rule.appId ?? "",
    servicePrincipalId: rule.servicePrincipalId ?? "",
    approvalStatus: rule.approvalStatus,
    approvedForAll: rule.approvedForAll ? "on" : "",
    approvedUsers: rule.approvedUsers.join(", "),
    approvedDepartments: rule.approvedDepartments.join(", "),
    allPermissionsAllowed: rule.allPermissionsAllowed ? "on" : "",
    allowedPermissions: rule.allowedPermissions.join(", "),
    allPermissionsProhibited:
      rule.allPermissionsProhibited && rule.approvalStatus !== "PROHIBITED" ? "on" : "",
    prohibitedPermissions: rule.prohibitedPermissions.join(", "),
    notes: rule.notes ?? "",
  };
}
