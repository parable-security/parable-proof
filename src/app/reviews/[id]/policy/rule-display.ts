import type { PolicyRule } from "@/lib/data/policy-rules";

// Display labels live in src/lib/rule-display.ts (shared with the report).

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
