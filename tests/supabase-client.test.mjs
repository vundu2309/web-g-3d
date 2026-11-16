import { test } from "node:test";
import assert from "node:assert/strict";
import { supabase } from "../src/platform/supabase-client.ts";
import { HubError } from "../src/platform/errors.ts";

test("without the Supabase configuration the account service fails with a clear message, never a silent fallback", () => {
  for (const env of [
    {},
    { VITE_SUPABASE_URL: "https://x.supabase.co" },
    { VITE_SUPABASE_PUBLISHABLE_KEY: "key" },
  ])
    assert.throws(
      () => supabase(env),
      (error) =>
        error instanceof HubError &&
        /chưa được cấu hình/.test(error.message) &&
        /VITE_SUPABASE_URL/.test(error.message),
    );
});
