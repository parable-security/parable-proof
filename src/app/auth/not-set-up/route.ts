import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// requireUser() redirects here when a Supabase user has no public.users row.
// Server Components cannot clear cookies, so the sign-out happens in this handler.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in?error=not_set_up", request.url));
}
