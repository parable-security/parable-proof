"use client";

import { useActionState } from "react";

import type { ResolveFindingState } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900";

export function ResolveFindingForm({
  action,
}: {
  action: (state: ResolveFindingState, formData: FormData) => Promise<ResolveFindingState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h3 className="font-medium">Mark Resolved</h3>
      {state?.formError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.formError}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Resolution note
        <textarea
          name="resolutionNote"
          required
          maxLength={2000}
          rows={3}
          placeholder="Application access removed by IT on October 20."
          defaultValue={state?.values.resolutionNote ?? ""}
          aria-invalid={errors?.resolutionNote ? true : undefined}
          className={inputClass}
        />
        {errors?.resolutionNote ? (
          <span className="text-sm font-normal text-red-600 dark:text-red-400">
            {errors.resolutionNote[0]}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Resolved by
        <input
          name="resolvedBy"
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          defaultValue={state?.values.resolvedBy ?? ""}
          aria-invalid={errors?.resolvedBy ? true : undefined}
          className={inputClass}
        />
        {errors?.resolvedBy ? (
          <span className="text-sm font-normal text-red-600 dark:text-red-400">
            {errors.resolvedBy[0]}
          </span>
        ) : null}
      </label>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">A resolution can&apos;t be undone.</p>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Resolving…" : "Mark Resolved"}
      </button>
    </form>
  );
}
