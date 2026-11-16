import { HubError, playerName } from "./errors.ts";
import type { User as SupabaseUser } from "@supabase/supabase-js";
export interface PlayerAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
}
const client = async () => (await import("./supabase-client")).supabase();
function identity(user: SupabaseUser | null): PlayerAccount | null {
  return user && !user.is_anonymous
    ? {
        uid: user.id,
        email: user.email || null,
        displayName: user.user_metadata.display_name || null,
      }
    : null;
}
export async function currentPlayer(): Promise<PlayerAccount | null> {
  const { data, error } = await (await client()).auth.getSession();
  if (error) throw error;
  return identity(data.session?.user || null);
}
export async function registerPlayer(
  email: string,
  password: string,
  name: string,
): Promise<PlayerAccount | null> {
  const { data, error } = await (
    await client()
  ).auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { display_name: playerName(name) },
      emailRedirectTo:
        import.meta.env.VITE_AUTH_REDIRECT_URL ||
        location.origin + location.pathname,
    },
  });
  if (error) throw error;
  if (!data.session) return null;
  return identity(data.user)!;
}
/** Sends the sign-up confirmation email again (only meaningful while confirmation is required). */
export async function resendConfirmation(email: string) {
  const { error } = await (
    await client()
  ).auth.resend({
    type: "signup",
    email: email.trim(),
    options: {
      emailRedirectTo:
        import.meta.env.VITE_AUTH_REDIRECT_URL ||
        location.origin + location.pathname,
    },
  });
  if (error) throw error;
}
export async function loginPlayer(
  email: string,
  password: string,
): Promise<PlayerAccount> {
  const { data, error } = await (
    await client()
  ).auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return identity(data.user)!;
}
export async function resetPassword(email: string) {
  const { error } = await (
    await client()
  ).auth.resetPasswordForEmail(email.trim(), {
    redirectTo:
      import.meta.env.VITE_AUTH_REDIRECT_URL ||
      location.origin + location.pathname,
  });
  if (error) throw error;
}
export async function logoutPlayer() {
  const { error } = await (await client()).auth.signOut();
  if (error) throw error;
}
export async function updatePassword(password: string) {
  const { error } = await (await client()).auth.updateUser({ password });
  if (error) throw error;
}
export function accountError(error: unknown): string {
  if (error instanceof HubError) return error.message;
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    invalid_credentials: "Email hoặc mật khẩu không đúng.",
    email_not_confirmed: "Hãy xác nhận email trước khi đăng nhập.",
    user_already_exists:
      "Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.",
    weak_password: "Mật khẩu cần ít nhất 6 ký tự.",
    over_request_rate_limit:
      "Bạn đã thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
    over_email_send_rate_limit:
      "Đã gửi quá nhiều email. Hãy đợi một lúc rồi thử lại.",
  };
  return messages[code] || "Không hoàn tất được thao tác. Hãy thử lại.";
}
export function observePlayer(
  listener: (user: PlayerAccount | null) => void,
): () => void {
  let stop: (() => void) | undefined;
  let active = true;
  void client()
    .then((c) => {
      if (!active) return;
      const { data } = c.auth.onAuthStateChange((event, session) => {
        listener(identity(session?.user || null));
        if (event === "PASSWORD_RECOVERY")
          window.dispatchEvent(new Event("account-password-recovery"));
      });
      stop = () => data.subscription.unsubscribe();
    })
    .catch(() => {
      if (active) listener(null);
    });
  return () => {
    active = false;
    stop?.();
  };
}
