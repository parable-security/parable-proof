import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-user";
import { getReview } from "@/lib/data/reviews";

// Allowed to block: the existence check must run before any streaming starts,
// so a missing or other-company review gets a real HTTP 404, not a streamed 200.
export const instant = false;

// Screen 2 placeholder: Define the AI Policy.
export default async function ReviewPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("customer_admin");
  const { id } = await params;
  // null for an invalid UUID, a missing review, or another company's review.
  const review = await getReview(user.companyId, id);
  if (!review) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
      <Link href="/reviews" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← Reviews
      </Link>
      <p className="text-sm text-zinc-500">Step 1 of 3: Your Approved AI Policy</p>
      <h1 className="text-2xl font-semibold tracking-tight">{review.reviewName}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Policy rules setup comes next.</p>
    </main>
  );
}
