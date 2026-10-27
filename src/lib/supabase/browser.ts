import { createClient } from "@supabase/supabase-js";

import { supabaseEnv } from "./env";

// Browser client with the publishable key, used only to upload to a signed
// upload URL. The one-time token in that URL authorizes the upload, so no
// session or storage policy is involved.
export function createBrowserStorageClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
