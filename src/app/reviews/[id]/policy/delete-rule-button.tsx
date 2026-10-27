"use client";

import { useActionState } from "react";

import type { MessageState } from "./actions";

export function DeleteRuleButton({
  action,
  appName,
}: {
  action: (state: MessageState) => Promise<MessageState>;
  appName: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Delete the rule for ${appName}?`)) event.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-red-700 hover:underline disabled:opacity-60 dark:text-red-400"
      >
        Delete
      </button>
      {state?.error ? <span className="ml-2 text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
