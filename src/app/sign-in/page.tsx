import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ACCOUNT_NOT_SET_UP, findAppUser, homeFor } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { SignInForm } from "./sign-in-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Parable Proof</h1>
        <Suspense fallback={null}>
          <SignInContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  // Auth is per request: never prerender it (supabase-js reads the clock for token expiry).
  await connection();
  // Already signed in with a set-up account: go straight to their home.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const appUser = await findAppUser(user.id);
    if (appUser) {
      redirect(homeFor(appUser.role));
    }
  }

  const { error } = await searchParams;
  const initialError = error === "not_set_up" ? ACCOUNT_NOT_SET_UP : undefined;

  return <SignInForm initialError={initialError} />;
}
