import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseEnv } from "./env";

// Supabase client with the secret key: bypasses RLS and storage policies.
// The only place that reads SUPABASE_SECRET_KEY. Import it only from
// src/lib/storage/, which scopes every call to the signed-in user's company.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY must be set");
  }
  return createClient(supabaseEnv().url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
