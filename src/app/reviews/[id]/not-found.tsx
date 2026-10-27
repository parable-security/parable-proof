import Link from "next/link";

// Same response whether the review is missing or belongs to another company.
export default function ReviewNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Review not found.</h1>
      <Link href="/reviews" className="text-sm underline-offset-2 hover:underline">
        Back to reviews
      </Link>
    </main>
  );
}
