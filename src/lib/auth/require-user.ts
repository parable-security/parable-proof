import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export type UserRole = (typeof users.$inferSelect)["role"];

export type AppUser = {
  userId: string;
  role: UserRole;
  // Always set for customer_admin, always null for parable_staff (DB check).
  companyId: string | null;
  fullName: string;
};

export const ACCOUNT_NOT_SET_UP = "Account not set up. Contact Parable Security Admin.";

export function homeFor(role: UserRole): "/staff" | "/reviews" {
  return role === "parable_staff" ? "/staff" : "/reviews";
}

export async function findAppUser(userId: string): Promise<AppUser | null> {
  const [row] = await db
    .select({
      userId: users.id,
      role: users.role,
      companyId: users.companyId,
      fullName: users.fullName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// The verified signed-in user, or a redirect to /sign-in.
// Every protected page and server action must call this (or requireRole) first.
// Company-scoped queries must take companyId from here, never from user input.
export const requireUser = cache(async (): Promise<AppUser> => {
  // Auth is per request: never prerender it (supabase-js reads the clock for token expiry).
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    redirect("/sign-in");
  }

  const appUser = await findAppUser(user.id);
  if (!appUser) {
    // Signed in to Supabase but no public.users row: sign out and explain.
    redirect("/auth/not-set-up");
  }
  return appUser;
});

// Like requireUser, but sends users with a different role to their own home.
export async function requireRole(role: UserRole): Promise<AppUser> {
  const appUser = await requireUser();
  if (appUser.role !== role) {
    redirect(homeFor(appUser.role));
  }
  return appUser;
}
