import { serverTimestamp } from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import type { User } from "firebase/auth";
import { playerName } from "../hub/model";

// Build profile data for the same transaction that creates/joins a room.
export function playerProfile(user: User, existing?: DocumentData) {
  return {
    displayName: playerName(
      user.displayName ||
        existing?.displayName ||
        user.email?.split("@")[0] ||
        "Người chơi",
    ),
    createdAt: existing?.createdAt || serverTimestamp(),
  };
}
