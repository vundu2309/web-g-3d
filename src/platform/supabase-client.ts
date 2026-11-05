import { createClient } from "@supabase/supabase-js";
import { HubError } from "../hub/model";
let client: ReturnType<typeof createClient> | undefined;
export function supabase() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new HubError("Dịch vụ đăng nhập chưa được cấu hình.");
    client = createClient(url, key);
  }
  return client;
}
