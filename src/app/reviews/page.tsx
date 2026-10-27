import { Suspense } from "react";

import { SignOutButton } from "@/app/_components/sign-out-button";
import { requireRole } from "@/lib/auth/require-user";

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

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <SignOutButton />
      </header>
      <p>Signed in as {user.fullName}.</p>
    </>
  );
}
