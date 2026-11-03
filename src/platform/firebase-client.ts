import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
const emulated =
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === "true";
export const firebaseConfig = {
  apiKey: "AIzaSyAWuubrajRnSynquICOwsnSLRn_p68CAUo",
  authDomain: "movieapp-fa2d4.firebaseapp.com",
  projectId: emulated ? "demo-photyphu" : "movieapp-fa2d4",
  appId: "1:1071572901905:web:4d7072ef0a493528ea11b0",
};
const existing = getApps()[0];
export const firebaseApp = existing || initializeApp(firebaseConfig);
export const playerAuth = getAuth(firebaseApp);
if (emulated) {
  connectAuthEmulator(
    playerAuth,
    `http://127.0.0.1:${Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099)}`,
    { disableWarnings: true },
  );
}

export { emulated };
