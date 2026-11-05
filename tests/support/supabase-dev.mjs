import { createServer } from "vite";

// A dev server built in "Supabase mode" for browser tests that exercise the real
// account + Socket.IO path without a real Supabase project. Auth traffic goes to a
// fake origin that tests answer themselves (page.route or a fake `request`).
export const FAKE_SUPABASE = "http://127.0.0.1:18999";
export const API_PORT = 18787;

export async function startSupabaseDev() {
  Object.assign(process.env, {
    VITE_ONLINE_BACKEND: "supabase",
    VITE_SUPABASE_URL: FAKE_SUPABASE,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
  });
  const vite = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "warn",
  });
  await vite.listen();
  return {
    vite,
    origin: `http://127.0.0.1:${vite.httpServer.address().port}`,
  };
}

/** Puts a signed-in Supabase session into a browser context's storage. */
export function seedSession(context, { token, id, name }) {
  return context.addInitScript(
    ({ token, id, name }) => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: `r-${id}`,
          user: {
            id,
            aud: "authenticated",
            role: "authenticated",
            email: `${id}@test.dev`,
            app_metadata: {},
            user_metadata: { display_name: name },
            created_at: new Date().toISOString(),
          },
        }),
      );
    },
    { token, id, name },
  );
}
