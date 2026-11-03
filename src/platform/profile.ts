import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { currentPlayer } from "./account";
import { playerDatabase } from "./firestore-client";
import { HubError, playerName } from "../hub/model";
export async function syncPlayerProfile() {
  const user = await currentPlayer();
  if (!user) throw new HubError("Hãy đăng nhập để chơi online.");
  const reference = doc(playerDatabase, "monopolyHub/v1/profiles", user.uid);
  const displayName = await runTransaction(
    playerDatabase,
    async (transaction) => {
      const snapshot = await transaction.get(reference);
      const existing = snapshot.data();
      const name = playerName(
        user.displayName ||
          existing?.displayName ||
          user.email?.split("@")[0] ||
          "Người chơi",
      );
      if (!snapshot.exists() || existing?.displayName !== name)
        transaction.set(reference, {
          displayName: name,
          createdAt: existing?.createdAt || serverTimestamp(),
        });
      return name;
    },
  );
  return { user, displayName };
}
