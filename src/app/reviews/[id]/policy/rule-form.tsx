"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { RuleFieldErrorKey, RuleFormFields } from "@/lib/validation/policy-rule";

import type { RuleFormState } from "./actions";

type RuleAction = (state: RuleFormState, formData: FormData) => Promise<RuleFormState>;

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-base font-normal disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <span className="text-sm font-normal text-red-600 dark:text-red-400">{messages.join(" ")}</span>
  );
}

export function RuleForm({
  action,
  initialValues,
  cancelHref,
  submitLabel,
}: {
  action: RuleAction;
  initialValues: RuleFormFields;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const values = state?.values ?? initialValues;
  const errors = state?.fieldErrors ?? {};
  const err = (key: RuleFieldErrorKey) => errors[key];

  // UI conveniences only; the server applies the same rules.
  const [status, setStatus] = useState(values.approvalStatus ?? "CONDITIONAL");
  const [forAll, setForAll] = useState(values.approvedForAll === "on");
  const [allAllowed, setAllAllowed] = useState(values.allPermissionsAllowed === "on");
  const [allProhibited, setAllProhibited] = useState(values.allPermissionsProhibited === "on");
  const isProhibited = status === "PROHIBITED";

  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
      {state?.formError ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.formError}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-medium">
        AI application name
        <input name="appName" required maxLength={200} defaultValue={values.appName ?? ""} className={inputClass} />
        <FieldError messages={err("appName")} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Microsoft app ID (optional)
          <input name="appId" maxLength={200} defaultValue={values.appId ?? ""} className={inputClass} />
          <FieldError messages={err("appId")} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Service principal ID (optional)
          <input
            name="servicePrincipalId"
            maxLength={200}
            defaultValue={values.servicePrincipalId ?? ""}
            className={inputClass}
          />
          <FieldError messages={err("servicePrincipalId")} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Status
        <select
          name="approvalStatus"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className={inputClass}
        >
          <option value="APPROVED">Approved</option>
          <option value="CONDITIONAL">Conditional</option>
          <option value="PROHIBITED">Prohibited</option>
        </select>
        <FieldError messages={err("approvalStatus")} />
      </label>

      {isProhibited ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Prohibited applications have no approved users and all permissions prohibited.
        </p>
      ) : (
        <>
          <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <legend className="px-1 text-sm font-medium">Who is approved</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="approvedForAll"
                checked={forAll}
                onChange={(event) => setForAll(event.target.checked)}
              />
              Approved for all employees
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Approved users (emails, comma-separated)
              <input
                name="approvedUsers"
                disabled={forAll}
                defaultValue={values.approvedUsers ?? ""}
                className={inputClass}
              />
              <FieldError messages={err("approvedUsers")} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Approved departments (comma-separated)
              <input
                name="approvedDepartments"
                disabled={forAll}
                defaultValue={values.approvedDepartments ?? ""}
                className={inputClass}
              />
              <FieldError messages={err("approvedDepartments")} />
            </label>
            <FieldError messages={err("population")} />
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <legend className="px-1 text-sm font-medium">Permissions</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allPermissionsAllowed"
                checked={allAllowed}
                onChange={(event) => setAllAllowed(event.target.checked)}
              />
              All permissions allowed
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Allowed permissions (comma-separated)
              <input
                name="allowedPermissions"
                disabled={allAllowed || allProhibited}
                defaultValue={values.allowedPermissions ?? ""}
                className={inputClass}
              />
              <FieldError messages={err("allowedPermissions")} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allPermissionsProhibited"
                checked={allProhibited}
                onChange={(event) => setAllProhibited(event.target.checked)}
              />
              All permissions prohibited
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Prohibited permissions (comma-separated)
              <input
                name="prohibitedPermissions"
                disabled={allProhibited}
                defaultValue={values.prohibitedPermissions ?? ""}
                className={inputClass}
              />
              <FieldError messages={err("prohibitedPermissions")} />
            </label>
            <FieldError messages={err("permissions")} />
          </fieldset>
        </>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes (optional)
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes ?? ""} className={inputClass} />
        <FieldError messages={err("notes")} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          Cancel
        </Link>
      </div>
    </form>
  );
}
