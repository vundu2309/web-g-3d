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
export { firebaseAccountError as accountError } from "./account-errors";

export const observePlayer = (
  listener: (user: import("firebase/auth").User | null) => void,
) =>
  onAuthStateChanged(playerAuth, (user) =>
    listener(user?.isAnonymous ? null : user),
  );
