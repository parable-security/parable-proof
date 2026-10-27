"use client";

import { useActionState } from "react";

import { createReviewAction } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900";

export function NewReviewForm({
  defaultName,
  todayLabel,
}: {
  defaultName: string;
  todayLabel: string;
}) {
  const [state, action, pending] = useActionState(createReviewAction, undefined);
  const errors = state?.fieldErrors;

  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Review name
        <input
          name="reviewName"
          type="text"
          required
          maxLength={200}
          defaultValue={state?.values.reviewName ?? defaultName}
          aria-invalid={errors?.reviewName ? true : undefined}
          className={inputClass}
        />
        {errors?.reviewName ? (
          <span className="text-sm font-normal text-red-600 dark:text-red-400">
            {errors.reviewName[0]}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Reviewer name
        <input
          name="reviewer"
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          defaultValue={state?.values.reviewer ?? ""}
          aria-invalid={errors?.reviewer ? true : undefined}
          className={inputClass}
        />
        {errors?.reviewer ? (
          <span className="text-sm font-normal text-red-600 dark:text-red-400">
            {errors.reviewer[0]}
          </span>
        ) : null}
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Review date</span>
        <span>{todayLabel}</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}
