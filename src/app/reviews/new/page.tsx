import Link from "next/link";
import { Suspense } from "react";

import { requireRole } from "@/lib/auth/require-user";
import { defaultReviewName, formatReviewDate, todayInBusinessTz } from "@/lib/dates";

import { NewReviewForm } from "./new-review-form";

// Screen 1: Create AI Access Check. No company field: it comes from the account.
export default function NewReviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <Link href="/reviews" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← Reviews
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New AI Access Check</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <NewReviewContent />
      </Suspense>
    </main>
  );
}

async function NewReviewContent() {
  // requireRole runs first: it calls connection(), so reading the clock is allowed.
  await requireRole("customer_admin");
  const today = todayInBusinessTz();

  return (
    <NewReviewForm defaultName={defaultReviewName(today)} todayLabel={formatReviewDate(today)} />
  );
}
