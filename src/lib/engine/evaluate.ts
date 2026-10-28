// The deterministic rule engine (Screen 4). Pure: no database, network, UI,
// clock or randomness, and no imports. Same input, same output: inputs are
// sorted by id before lookups, so their order never changes the result.
// Decisions: docs/v0-user-journey.md Part A Screen 4 and Part B "Engine".

export type ApprovalStatus = "APPROVED" | "CONDITIONAL" | "PROHIBITED";
export type AppClassification = "AI" | "NOT_AI";
export type AssignmentScope = "TENANT" | "USER";

// A policy_rules row. Precondition: the caller passes only active
// (not deleted), CCO-approved rules of the review's company.
export type EngineRule = {
  id: string;
  appName: string;
  appId: string | null;
  servicePrincipalId: string | null;
  approvalStatus: ApprovalStatus;
  approvedForAll: boolean;
  approvedUsers: string[];
  approvedDepartments: string[];
  allPermissionsAllowed: boolean;
  allowedPermissions: string[];
  allPermissionsProhibited: boolean;
  prohibitedPermissions: string[];
  notes: string | null;
  approvedAt: Date | null;
};

// An app_catalog row (shared across customers).
export type CatalogEntry = {
  id: string;
  appName: string;
  appId: string | null;
  classification: AppClassification;
};

// An evidence_records row.
export type EvidenceRow = {
  id: string;
  rowNumber: number;
  userEmail: string | null;
  appName: string;
  appId: string;
  servicePrincipalId: string | null;
  permissionScope: string;
  consentType: string;
  resourceName: string;
  observedAt: Date;
  assignmentScope: AssignmentScope;
  userDepartment: string | null;
};

export type EngineInput = {
  rules: EngineRule[];
  catalog: CatalogEntry[];
  evidence: EvidenceRow[];
};

export type FindingResult = "COMPLIANT" | "POLICY_EXCEPTION" | "REVIEW_REQUIRED";

export type CheckType =
  | "prohibited_app"
  | "unknown_ai_app"
  | "unclassified_app"
  | "unauthorized_user"
  | "prohibited_permission"
  | "name_match_only"
  | "unlisted_permission"
  | "compliant";

export type RuleMatch = "app_id" | "service_principal_id" | "app_name";

// Frozen copy of the rule, stored in findings.policy_rule_snapshot (plain JSON values).
export type PolicyRuleSnapshot = {
  id: string;
  appName: string;
  appId: string | null;
  servicePrincipalId: string | null;
  approvalStatus: ApprovalStatus;
  approvedForAll: boolean;
  approvedUsers: string[];
  approvedDepartments: string[];
  allPermissionsAllowed: boolean;
  allowedPermissions: string[];
  allPermissionsProhibited: boolean;
  prohibitedPermissions: string[];
  notes: string | null;
  approvedAt: string | null;
  matchedBy: RuleMatch;
};

// findings insert shape minus id, review_id, timestamps and resolution fields.
export type FindingInput = {
  evidenceRecordId: string;
  policyRuleId: string | null;
  policyRuleSnapshot: PolicyRuleSnapshot | null;
  checkType: CheckType;
  result: FindingResult;
  reason: string;
  appName: string;
  appId: string | null;
  servicePrincipalId: string | null;
  userEmail: string | null;
  observedPermission: string;
};

// Each check type has exactly one result (matches findings_check_result_check).
export const CHECK_RESULT: Readonly<Record<CheckType, FindingResult>> = {
  prohibited_app: "POLICY_EXCEPTION",
  unauthorized_user: "POLICY_EXCEPTION",
  prohibited_permission: "POLICY_EXCEPTION",
  unknown_ai_app: "REVIEW_REQUIRED",
  unclassified_app: "REVIEW_REQUIRED",
  name_match_only: "REVIEW_REQUIRED",
  unlisted_permission: "REVIEW_REQUIRED",
  compliant: "COMPLIANT",
};

// Spec wording where it exists (Part A, Screen 4).
export const REASONS = {
  prohibited_app: "Prohibited AI application detected.",
  unknown_ai_app: "AI application observed but no approved policy rule exists.",
  unclassified_app:
    "Application is not in the approved policy or the Parable app catalog. Parable staff must classify it before a result can be given.",
  name_match_only:
    "A policy rule matches this application by name only. The application ID could not be confirmed, so the result needs review.",
  unauthorized_user: "User is outside the approved population.",
  prohibited_permission: "Application has a permission prohibited by company policy.",
  unlisted_permission:
    "Permission is not on the allowed or prohibited list for this conditionally approved application.",
  compliant: "Application, user and permission match the approved policy.",
  compliantTenant: "Tenant-wide access matches the approved policy.",
} as const;

export const DEPARTMENT_NOT_CHECKED_NOTE =
  " The user's department was not checked because it is missing from the evidence.";

// Every comparison ignores case and surrounding whitespace.
function key(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function keySet(values: string[]): Set<string> {
  return new Set(values.map(key).filter((value) => value !== ""));
}

// Code-unit order, not localeCompare: the same on every machine.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// First entry (in sorted order) wins for each key; blank keys are skipped.
function indexBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(keyOf(item));
    if (itemKey !== "" && !map.has(itemKey)) map.set(itemKey, item);
  }
  return map;
}

// Microsoft writes delegated consents as space-separated scopes ("Files.Read Mail.Read").
function permissionTokens(permissionScope: string): string[] {
  return permissionScope
    .trim()
    .split(/\s+/)
    .map(key)
    .filter((token) => token !== "");
}

function snapshotOf(rule: EngineRule, matchedBy: RuleMatch): PolicyRuleSnapshot {
  return {
    id: rule.id,
    appName: rule.appName,
    appId: rule.appId,
    servicePrincipalId: rule.servicePrincipalId,
    approvalStatus: rule.approvalStatus,
    approvedForAll: rule.approvedForAll,
    approvedUsers: [...rule.approvedUsers],
    approvedDepartments: [...rule.approvedDepartments],
    allPermissionsAllowed: rule.allPermissionsAllowed,
    allowedPermissions: [...rule.allowedPermissions],
    allPermissionsProhibited: rule.allPermissionsProhibited,
    prohibitedPermissions: [...rule.prohibitedPermissions],
    notes: rule.notes,
    approvedAt: rule.approvedAt ? rule.approvedAt.toISOString() : null,
    matchedBy,
  };
}

type Decision = { checkType: CheckType; reason: string };

type PopulationOutcome = "PASS" | "FAIL" | "DEPARTMENT_NOT_CHECKED";

// Rule 3 (unauthorized user). TENANT rows have no single user and skip it.
// A missing department skips only the department part: the row can't fail on
// a department we don't know, but an email-only rule is still enforced.
function checkPopulation(rule: EngineRule, row: EvidenceRow): PopulationOutcome {
  if (row.assignmentScope === "TENANT" || rule.approvedForAll) return "PASS";

  const email = key(row.userEmail);
  if (email !== "" && keySet(rule.approvedUsers).has(email)) return "PASS";

  const departments = keySet(rule.approvedDepartments);
  const department = key(row.userDepartment);
  if (department === "") {
    return departments.size > 0 ? "DEPARTMENT_NOT_CHECKED" : "FAIL";
  }
  return departments.has(department) ? "PASS" : "FAIL";
}

// Checks for a rule matched by app_id or service principal; the first failure decides.
function decideWithRule(rule: EngineRule, row: EvidenceRow): Decision {
  if (rule.approvalStatus === "PROHIBITED") {
    return { checkType: "prohibited_app", reason: REASONS.prohibited_app };
  }

  const population = checkPopulation(rule, row);
  if (population === "FAIL") {
    return { checkType: "unauthorized_user", reason: REASONS.unauthorized_user };
  }
  const note = population === "DEPARTMENT_NOT_CHECKED" ? DEPARTMENT_NOT_CHECKED_NOTE : "";

  const tokens = permissionTokens(row.permissionScope);
  const prohibited = keySet(rule.prohibitedPermissions);
  if (rule.allPermissionsProhibited || tokens.some((token) => prohibited.has(token))) {
    return { checkType: "prohibited_permission", reason: REASONS.prohibited_permission + note };
  }

  const compliantReason =
    row.assignmentScope === "TENANT" ? REASONS.compliantTenant : REASONS.compliant;
  if (rule.approvalStatus === "APPROVED") {
    return { checkType: "compliant", reason: compliantReason + note };
  }

  // CONDITIONAL: compliant only when every observed permission is allowed.
  const allowed = keySet(rule.allowedPermissions);
  if (
    rule.allPermissionsAllowed ||
    (tokens.length > 0 && tokens.every((token) => allowed.has(token)))
  ) {
    return { checkType: "compliant", reason: compliantReason + note };
  }
  return { checkType: "unlisted_permission", reason: REASONS.unlisted_permission + note };
}

export function evaluateEvidence(input: EngineInput): FindingInput[] {
  const rules = [...input.rules].sort((a, b) => compareStrings(a.id, b.id));
  const catalog = [...input.catalog].sort((a, b) => compareStrings(a.id, b.id));
  const evidence = [...input.evidence].sort(
    (a, b) => a.rowNumber - b.rowNumber || compareStrings(a.id, b.id),
  );

  const rulesByAppId = indexBy(rules, (rule) => rule.appId);
  const rulesByServicePrincipalId = indexBy(rules, (rule) => rule.servicePrincipalId);
  // A different ID is a different app: name matching only uses rules with no ID.
  const rulesByName = indexBy(
    rules.filter((rule) => key(rule.appId) === "" && key(rule.servicePrincipalId) === ""),
    (rule) => rule.appName,
  );
  const catalogByAppId = indexBy(catalog, (entry) => entry.appId);
  // Same for the catalog, so a different app can't be excluded as NOT_AI by name.
  const catalogByName = indexBy(
    catalog.filter((entry) => key(entry.appId) === ""),
    (entry) => entry.appName,
  );

  const findings: FindingInput[] = [];
  for (const row of evidence) {
    let rule: EngineRule | undefined;
    let matchedBy: RuleMatch | undefined;
    let decision: Decision;

    const byAppId = rulesByAppId.get(key(row.appId));
    const byServicePrincipal = rulesByServicePrincipalId.get(key(row.servicePrincipalId));
    const byName = rulesByName.get(key(row.appName));

    if (byAppId) {
      [rule, matchedBy] = [byAppId, "app_id"];
      decision = decideWithRule(rule, row);
    } else if (byServicePrincipal) {
      [rule, matchedBy] = [byServicePrincipal, "service_principal_id"];
      decision = decideWithRule(rule, row);
    } else if (byName) {
      // Never a confident verdict from a name alone.
      [rule, matchedBy] = [byName, "app_name"];
      decision = { checkType: "name_match_only", reason: REASONS.name_match_only };
    } else {
      const entry = catalogByAppId.get(key(row.appId)) ?? catalogByName.get(key(row.appName));
      if (entry?.classification === "NOT_AI") continue; // excluded from results
      decision =
        entry?.classification === "AI"
          ? { checkType: "unknown_ai_app", reason: REASONS.unknown_ai_app }
          : { checkType: "unclassified_app", reason: REASONS.unclassified_app };
    }

    findings.push({
      evidenceRecordId: row.id,
      policyRuleId: rule ? rule.id : null,
      policyRuleSnapshot: rule && matchedBy ? snapshotOf(rule, matchedBy) : null,
      checkType: decision.checkType,
      result: CHECK_RESULT[decision.checkType],
      reason: decision.reason,
      appName: row.appName,
      appId: row.appId,
      servicePrincipalId: row.servicePrincipalId,
      userEmail: row.userEmail,
      observedPermission: row.permissionScope,
    });
  }
  return findings;
}

export type FindingsSummary = {
  applications: number;
  compliant: number;
  exceptions: number;
  reviewRequired: number;
};

// Counts unique applications (Screen 5). An app is an exception if any of its
// findings is, otherwise review if any needs review, otherwise compliant.
export function summarizeFindings(
  findings: Pick<FindingInput, "appId" | "appName" | "result">[],
): FindingsSummary {
  const RANK: Record<FindingResult, number> = {
    COMPLIANT: 0,
    REVIEW_REQUIRED: 1,
    POLICY_EXCEPTION: 2,
  };
  const worstByApp = new Map<string, FindingResult>();
  for (const finding of findings) {
    const appKey = key(finding.appId) !== "" ? `id:${key(finding.appId)}` : `name:${key(finding.appName)}`;
    const current = worstByApp.get(appKey);
    if (!current || RANK[finding.result] > RANK[current]) worstByApp.set(appKey, finding.result);
  }

  const summary: FindingsSummary = { applications: 0, compliant: 0, exceptions: 0, reviewRequired: 0 };
  for (const result of worstByApp.values()) {
    summary.applications += 1;
    if (result === "POLICY_EXCEPTION") summary.exceptions += 1;
    else if (result === "REVIEW_REQUIRED") summary.reviewRequired += 1;
    else summary.compliant += 1;
  }
  return summary;
}
