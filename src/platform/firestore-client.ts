import {
  initializeFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { firebaseApp, emulated } from "./firebase-client";
export const playerDatabase = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: false,
});
if (emulated)
  connectFirestoreEmulator(
    playerDatabase,
    "127.0.0.1",
    Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080),
  );
