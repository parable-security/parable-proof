"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ACCOUNT_NOT_SET_UP, findAppUser, homeFor } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string } | undefined;

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
});

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
  if (signInError) {
    // Generic on purpose: do not reveal whether the account exists.
    return { error: "Invalid email or password." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Invalid email or password." };
  }

  const appUser = await findAppUser(user.id);
  if (!appUser) {
    await supabase.auth.signOut();
    return { error: ACCOUNT_NOT_SET_UP };
  }

  // Outside any try/catch: redirect() works by throwing.
  redirect(homeFor(appUser.role));
}
