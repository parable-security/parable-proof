"use client";

import { useActionState } from "react";

import type { MessageState } from "./actions";

export function ApproveRulesButton({
  action,
  pendingCount,
}: {
  action: (state: MessageState) => Promise<MessageState>;
  pendingCount: number;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Approving…" : "Approve Policy Rules"}
      </button>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {pendingCount === 0
          ? "No rules are waiting for approval."
          : `${pendingCount} ${pendingCount === 1 ? "rule is" : "rules are"} waiting for approval.`}
      </span>
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state?.message ? <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p> : null}
    </form>
  );
}
