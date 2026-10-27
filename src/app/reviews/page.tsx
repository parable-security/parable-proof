import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/app/_components/sign-out-button";
import { requireRole } from "@/lib/auth/require-user";
import { listReviews } from "@/lib/data/reviews";
import { formatReviewDate } from "@/lib/dates";

import { reviewStatusLabel } from "./status-label";

export default function ReviewsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <ReviewsContent />
      </Suspense>
    </main>
  );
}

async function ReviewsContent() {
  const user = await requireRole("customer_admin");
  const items = await listReviews(user.companyId);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/reviews/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            New AI Access Check
          </Link>
          <SignOutButton />
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No reviews yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((review) => (
                <tr key={review.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4">
                    <Link href={`/reviews/${review.id}/policy`} className="font-medium underline-offset-2 hover:underline">
                      {review.reviewName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatReviewDate(review.reviewDate)}</td>
                  <td className="py-2">{reviewStatusLabel[review.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
