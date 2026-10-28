"use client";

import { useState, useTransition } from "react";

export type DownloadUrlResult = { ok: true; url: string } | { ok: false; error: string };

// Asks the server for a 60-second signed link, then follows it. The link is
// created on click, so a stale page never holds a usable URL.
export function FileDownloadButton({ action }: { action: () => Promise<DownloadUrlResult> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign(result.url);
      } catch {
        setError("Could not create a download link. Try again.");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-sm underline-offset-2 hover:underline disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Download"}
      </button>
      {error ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </span>
  );
}
