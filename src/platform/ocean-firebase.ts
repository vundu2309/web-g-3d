import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { playerDatabase } from "./firestore-client";
import { currentPlayer } from "./account";
import { HubError } from "../hub/model";
import { readBoat, spawn, type Boat, type Pose } from "../ocean/model";

// A single shared world. No room, host, invitation or ready-state dependencies.
const path = "monopolyHub/v1/oceanBoats";
export async function connectOcean(
  onBoats: (boats: Boat[], serverTime: number) => void,
  onError: (error: unknown) => void,
  signal: AbortSignal,
) {
  const user = await currentPlayer();
  if (!user || signal.aborted) throw new HubError("Hãy đăng nhập để ra khơi.");
  const uid = user.uid;
  const session = crypto.randomUUID();
  const name = (user.displayName?.trim() || "Người đi biển").slice(0, 24);
  const ref = doc(playerDatabase, path, uid);
  let disposed = false;
  let inFlight = false;
  let stop: (() => void) | undefined;
  let clockOffset = 0;
  let lastStamp = 0;
  const pose = spawn(uid);
  const ensureActive = () => {
    if (disposed || signal.aborted) throw new HubError("Đã rời biển.");
  };
  // Transactions fail offline instead of enqueueing old motion for a reconnect.
  async function publish(next: Pose, joining = false) {
    if (inFlight || disposed || signal.aborted) return;
    inFlight = true;
    try {
      await runTransaction(playerDatabase, async (transaction) => {
        const previous = await transaction.get(ref);
        ensureActive();
        if (
          !joining &&
          (!previous.exists() || previous.data().session !== session)
        )
          throw new HubError(
            "Tài khoản đã mở thuyền ở cửa sổ khác. Hãy quay về hub rồi vào lại.",
          );
        transaction.set(ref, {
          ...next,
          name,
          session,
          updatedAt: serverTimestamp(),
        });
      });
    } finally {
      inFlight = false;
    }
  }
  async function removeOwnSession() {
    await runTransaction(playerDatabase, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists() && snapshot.data().session === session)
        transaction.delete(ref);
    });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop?.();
    signal.removeEventListener("abort", dispose);
    // Abrupt tab/network loss is covered by the presence lease as well.
    void removeOwnSession().catch(() => {});
  }
  signal.addEventListener("abort", dispose, { once: true });
  try {
    await publish(pose, true);
    ensureActive();
    stop = onSnapshot(
      query(
        collection(playerDatabase, path),
        orderBy("updatedAt", "desc"),
        limit(100),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (disposed || snapshot.metadata.fromCache) return;
        const boats = snapshot.docs.flatMap((item) => {
          const boat = readBoat(item.id, item.data());
          return boat ? [boat] : [];
        });
        const self = boats.find((boat) => boat.uid === uid);
        if (self && self.session !== session) {
          onError(
            new HubError(
              "Tài khoản đã mở thuyền ở cửa sổ khác. Hãy quay về hub rồi vào lại.",
            ),
          );
          dispose();
          return;
        }
        if (
          self &&
          !snapshot.metadata.hasPendingWrites &&
          self.updatedAt !== lastStamp
        ) {
          clockOffset = self.updatedAt - Date.now();
          lastStamp = self.updatedAt;
        }
        onBoats(boats, Date.now() + clockOffset);
      },
      onError,
    );
    return { uid, pose, publish, dispose, sendMs: 1000, delayMs: 1300 };
  } catch (error) {
    dispose();
    throw error;
  }
}
