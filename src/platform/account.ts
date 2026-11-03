import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { playerAuth } from "./firebase-client";
import { HubError, playerName } from "../hub/model";
export async function currentPlayer() {
  await playerAuth.authStateReady();
  return playerAuth.currentUser?.isAnonymous ? null : playerAuth.currentUser;
}
export async function registerPlayer(
  email: string,
  password: string,
  name: string,
) {
  const displayName = playerName(name);
  const { user } = await createUserWithEmailAndPassword(
    playerAuth,
    email.trim(),
    password,
  );
  try {
    await updateProfile(user, { displayName });
  } catch {
    throw new HubError(
      "Tài khoản đã tạo, nhưng chưa lưu được tên. Hãy đóng form và đăng nhập lại.",
    );
  }
  return user;
}
export async function loginPlayer(email: string, password: string) {
  return (await signInWithEmailAndPassword(playerAuth, email.trim(), password))
    .user;
}
export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(playerAuth, email.trim());
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw error;
  }
}
export const logoutPlayer = () => signOut(playerAuth);
export function accountError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/wrong-password": "Email hoặc mật khẩu không đúng.",
    "auth/user-not-found": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use":
      "Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.",
    "auth/invalid-email": "Địa chỉ email chưa hợp lệ.",
    "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
    "auth/password-does-not-meet-requirements":
      "Mật khẩu chưa đáp ứng chính sách của game. Hãy dùng mật khẩu dài hơn, có chữ hoa, chữ thường và số.",
    "auth/too-many-requests":
      "Bạn đã thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
    "auth/network-request-failed":
      "Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.",
    "auth/operation-not-allowed":
      "Chưa bật Email/Password trong Firebase Authentication.",
    "auth/admin-restricted-operation":
      "Email/Password chưa được phép trong Firebase Authentication.",
    "auth/user-disabled": "Tài khoản đã bị vô hiệu hóa.",
  };
  return error instanceof HubError
    ? error.message
    : messages[code || ""] || "Không hoàn tất được thao tác. Hãy thử lại.";
}

export const observePlayer = (
  listener: (user: import("firebase/auth").User | null) => void,
) =>
  onAuthStateChanged(playerAuth, (user) =>
    listener(user?.isAnonymous ? null : user),
  );
