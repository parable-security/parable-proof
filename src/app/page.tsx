import Link from "next/link";

// Screen 0: Landing. Both buttons go to sign-in (no public signup in V0).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Parable Proof</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Evidence-Backed AI &amp; Security Verification
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/sign-in"
          className="rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start Verification
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-zinc-300 px-5 py-2.5 font-medium dark:border-zinc-700"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
