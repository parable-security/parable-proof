import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/app/_components/sign-out-button";
import { reviewStatusLabel } from "@/app/reviews/status-label";
import { requireRole } from "@/lib/auth/require-user";
import { listReviewsForStaff } from "@/lib/data/staff";
import { formatTimestamp } from "@/lib/dates";

export default function StaffPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <StaffContent />
      </Suspense>
    </main>
  );
}

async function StaffContent() {
  const user = await requireRole("parable_staff");
  const items = await listReviewsForStaff();

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">All Reviews</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Signed in as {user.fullName}.</p>
        </div>
        <SignOutButton />
      </header>

      {items.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No reviews yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">Review</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Raw export uploaded</th>
              </tr>
            </thead>
            <tbody>
              {items.map((review) => (
                <tr key={review.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                  <td className="py-2 pr-4">{review.companyName}</td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/staff/reviews/${review.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {review.reviewName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {review.status === "EVIDENCE_SUBMITTED" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                        Needs conversion
                      </span>
                    ) : (
                      reviewStatusLabel[review.status]
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {review.rawExportUploadedAt ? formatTimestamp(review.rawExportUploadedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
