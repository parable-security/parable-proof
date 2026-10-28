"use client";

import { useActionState } from "react";

import type { RunCheckState } from "./actions";

export function RunCheckButton({
  action,
  rerun,
}: {
  action: (state: RunCheckState) => Promise<RunCheckState>;
  rerun: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Running…" : rerun ? "Run AI Policy Check Again" : "Run AI Policy Check"}
      </button>
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
