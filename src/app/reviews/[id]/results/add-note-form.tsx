"use client";

import { useActionState } from "react";

import type { FindingNoteState } from "./actions";

export function AddNoteForm({
  action,
}: {
  action: (state: FindingNoteState, formData: FormData) => Promise<FindingNoteState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const error = state?.fieldErrors?.note?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.formError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.formError}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Add a note
        <textarea
          name="note"
          required
          maxLength={2000}
          rows={2}
          placeholder="IT investigating with employee."
          defaultValue={state?.values.note ?? ""}
          aria-invalid={error ? true : undefined}
          className="rounded-md border border-zinc-300 px-3 py-2 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error ? (
          <span className="text-sm font-normal text-red-600 dark:text-red-400">{error}</span>
        ) : null}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-zinc-300 px-4 py-2 font-medium disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "Adding…" : "Add Note"}
      </button>
    </form>
  );
}
