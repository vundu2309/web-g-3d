import { createClient } from "@supabase/supabase-js";
import { HubError } from "./errors.ts";
let client: ReturnType<typeof createClient> | undefined;
/** The one Supabase client. Missing configuration is an error the player sees, never a fallback. */
export function supabase(
  env: Record<string, string | undefined> = import.meta.env,
) {
  if (!client) {
    const url = env.VITE_SUPABASE_URL;
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new HubError(
        "Dịch vụ đăng nhập chưa được cấu hình (thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY).",
      );
    client = createClient(url, key);
  }
  return client;
}
