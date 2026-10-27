import { Suspense } from "react";

import { SignOutButton } from "@/app/_components/sign-out-button";
import { requireRole } from "@/lib/auth/require-user";

export default function StaffPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <StaffContent />
      </Suspense>
    </main>
  );
}

async function StaffContent() {
  const user = await requireRole("parable_staff");

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <SignOutButton />
      </header>
      <p>Signed in as {user.fullName}.</p>
    </>
  );
}
