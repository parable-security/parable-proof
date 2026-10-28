import Link from "next/link";

export default function StaffReviewNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Review not found.</h1>
      <Link href="/staff" className="text-sm underline-offset-2 hover:underline">
        Back to all reviews
      </Link>
    </main>
  );
}
