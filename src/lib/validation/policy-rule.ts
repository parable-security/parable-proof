// Policy rule form validation and normalization. Pure: no database, no Next.js.
// The DB check constraints on policy_rules enforce the same shape rules.
import { z } from "zod";

export const APPROVAL_STATUSES = ["APPROVED", "CONDITIONAL", "PROHIBITED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// Form field names, shared by the form, the server action and this parser.
export const RULE_FIELD_NAMES = [
  "appName",
  "appId",
  "servicePrincipalId",
  "approvalStatus",
  "approvedForAll",
  "approvedUsers",
  "approvedDepartments",
  "allPermissionsAllowed",
  "allowedPermissions",
  "allPermissionsProhibited",
  "prohibitedPermissions",
  "notes",
] as const;

export type RuleFormFields = Partial<Record<(typeof RULE_FIELD_NAMES)[number], string>>;

export type PolicyRuleInput = {
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
};

// "population" and "permissions" hold errors that involve more than one field.
export type RuleFieldErrorKey =
  | "appName"
  | "appId"
  | "servicePrincipalId"
  | "approvalStatus"
  | "approvedUsers"
  | "approvedDepartments"
  | "allowedPermissions"
  | "prohibitedPermissions"
  | "notes"
  | "population"
  | "permissions";

export type RuleFieldErrors = Partial<Record<RuleFieldErrorKey, string[]>>;

export type ParseRuleResult =
  | { success: true; data: PolicyRuleInput }
  | { success: false; fieldErrors: RuleFieldErrors };

const MAX_LIST_ITEMS = 500;
const MAX_ITEM_LENGTH = 200;

// Split on commas, trim, drop empties, and remove duplicates ignoring case
// (the first spelling is kept). Matching against evidence is case-insensitive.
export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

const emailSchema = z.email();

// Emails are lowercased; anything that is not a valid email is returned in `invalid`.
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const item of splitList(raw)) {
    const email = item.toLowerCase();
    if (emailSchema.safeParse(email).success) {
      emails.push(email);
    } else {
      invalid.push(item);
    }
  }
  return { emails, invalid };
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value));

const scalarSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, "Enter the application name.")
    .max(200, "Application name must be 200 characters or fewer."),
  appId: optionalText(200, "Application ID"),
  servicePrincipalId: optionalText(200, "Service principal ID"),
  approvalStatus: z.enum(APPROVAL_STATUSES, { error: "Choose a status." }),
  notes: optionalText(2000, "Notes"),
});

function listSizeError(items: string[], label: string): string | null {
  if (items.length > MAX_LIST_ITEMS) {
    return `${label} can have at most ${MAX_LIST_ITEMS} entries.`;
  }
  if (items.some((item) => item.length > MAX_ITEM_LENGTH)) {
    return `Each ${label.toLowerCase()} entry must be ${MAX_ITEM_LENGTH} characters or fewer.`;
  }
  return null;
}

export function parsePolicyRuleForm(fields: RuleFormFields): ParseRuleResult {
  const errors: RuleFieldErrors = {};
  const addError = (key: RuleFieldErrorKey, message: string) => {
    (errors[key] ??= []).push(message);
  };
  const text = (key: (typeof RULE_FIELD_NAMES)[number]) => fields[key] ?? "";
  const checked = (key: (typeof RULE_FIELD_NAMES)[number]) => fields[key] === "on";

  const scalars = scalarSchema.safeParse({
    appName: text("appName"),
    appId: text("appId"),
    servicePrincipalId: text("servicePrincipalId"),
    approvalStatus: text("approvalStatus"),
    notes: text("notes"),
  });
  if (!scalars.success) {
    const scalarErrors = z.flattenError(scalars.error).fieldErrors;
    for (const [key, messages] of Object.entries(scalarErrors)) {
      for (const message of messages ?? []) {
        addError(key as RuleFieldErrorKey, message);
      }
    }
    return { success: false, fieldErrors: errors };
  }
  const { approvalStatus } = scalars.data;

  // PROHIBITED: the population and permission inputs are hidden in the form,
  // so anything submitted is ignored and the fixed shape is stored.
  if (approvalStatus === "PROHIBITED") {
    return {
      success: true,
      data: {
        ...scalars.data,
        approvedForAll: false,
        approvedUsers: [],
        approvedDepartments: [],
        allPermissionsAllowed: false,
        allowedPermissions: [],
        allPermissionsProhibited: true,
        prohibitedPermissions: [],
      },
    };
  }

  const users = parseEmailList(text("approvedUsers"));
  const approvedDepartments = splitList(text("approvedDepartments"));
  const allowedPermissions = splitList(text("allowedPermissions"));
  const prohibitedPermissions = splitList(text("prohibitedPermissions"));
  const approvedForAll = checked("approvedForAll");
  const allPermissionsAllowed = checked("allPermissionsAllowed");
  const allPermissionsProhibited = checked("allPermissionsProhibited");

  if (users.invalid.length > 0) {
    addError("approvedUsers", `Not valid email addresses: ${users.invalid.join(", ")}.`);
  }
  const sizeChecks: [RuleFieldErrorKey, string[], string][] = [
    ["approvedUsers", users.emails, "Approved users"],
    ["approvedDepartments", approvedDepartments, "Approved departments"],
    ["allowedPermissions", allowedPermissions, "Allowed permissions"],
    ["prohibitedPermissions", prohibitedPermissions, "Prohibited permissions"],
  ];
  for (const [key, items, label] of sizeChecks) {
    const message = listSizeError(items, label);
    if (message) addError(key, message);
  }

  // Population (who is approved).
  const hasListedPopulation = users.emails.length > 0 || approvedDepartments.length > 0;
  if (approvedForAll && hasListedPopulation) {
    addError("population", "Uncheck 'Approved for all' or clear the user and department lists.");
  } else if (!approvedForAll && !hasListedPopulation && users.invalid.length === 0) {
    addError("population", "Choose who is approved: everyone, or list users or departments.");
  }

  // Permissions. "All allowed" plus a prohibited list is allowed: everything except those.
  if (allPermissionsAllowed && allowedPermissions.length > 0) {
    addError("allowedPermissions", "Uncheck 'All permissions allowed' or clear the allowed list.");
  }
  if (allPermissionsProhibited && prohibitedPermissions.length > 0) {
    addError(
      "prohibitedPermissions",
      "Uncheck 'All permissions prohibited' or clear the prohibited list.",
    );
  }
  if (allPermissionsAllowed && allPermissionsProhibited) {
    addError("permissions", "A rule cannot both allow and prohibit all permissions.");
  }
  if (allPermissionsProhibited && allowedPermissions.length > 0) {
    addError("allowedPermissions", "Clear the allowed list when all permissions are prohibited.");
  }
  const prohibitedKeys = new Set(prohibitedPermissions.map((p) => p.toLowerCase()));
  const overlap = allowedPermissions.filter((p) => prohibitedKeys.has(p.toLowerCase()));
  if (overlap.length > 0) {
    addError("permissions", `On both the allowed and prohibited lists: ${overlap.join(", ")}.`);
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, fieldErrors: errors };
  }

  return {
    success: true,
    data: {
      ...scalars.data,
      approvedForAll,
      approvedUsers: users.emails,
      approvedDepartments,
      allPermissionsAllowed,
      allowedPermissions,
      allPermissionsProhibited,
      prohibitedPermissions,
    },
  };
}
