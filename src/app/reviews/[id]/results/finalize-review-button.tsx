"use client";

import { useActionState, useState } from "react";

import type { FinalizeState } from "./actions";

// Generate Compliance Report: asks for confirmation first, because
// finalizing freezes the review and can't be undone.
export function FinalizeReviewButton({
  action,
  openCount,
}: {
  action: (state: FinalizeState) => Promise<FinalizeState>;
  openCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Generate Compliance Report
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex max-w-sm flex-col gap-3 rounded-md border border-zinc-300 p-4 text-sm dark:border-zinc-700"
    >
      <p className="font-medium">
        {openCount === 0
          ? "All findings are resolved."
          : `${openCount.toLocaleString("en-US")} ${openCount === 1 ? "finding is" : "findings are"} still open.`}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        Finalizing freezes this review, its findings and notes, and creates the compliance report.
        This can&apos;t be undone.
      </p>
      {state?.error ? (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Generating report…" : "Finalize and generate report"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
