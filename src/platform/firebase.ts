import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { DocumentData } from "firebase/firestore";
import { playerDatabase } from "./firestore-client";
import { currentPlayer } from "./account";
import { playerProfile } from "./profile";
import { applyCommand, createRoom, generateCode, HubError } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";
function readRoom(data: DocumentData): Room {
  if (!(data.createdAt instanceof Timestamp))
    throw new HubError("Dữ liệu phòng không hợp lệ. Hãy tạo phòng mới.");
  return { ...data, createdAt: data.createdAt.toMillis() } as Room;
}
export async function createFirebaseStore(): Promise<RoomStore> {
  const user = await currentPlayer();
  if (!user) throw new HubError("Hãy đăng nhập để chơi online.");
  const uid = user.uid;
  let active = true;
  let knownProfileName: string | undefined;
  const reference = (code: string) =>
    doc(playerDatabase, "monopolyHub/v1/rooms", code);
  async function transact(
    code: string,
    change: (room: Room | null, displayName: string) => Room | null,
    synchronizeProfile = false,
  ) {
    const actor = await currentPlayer();
    if (!active || actor?.uid !== uid) throw new HubError("Hãy đăng nhập lại.");
    const needsProfileRead =
      synchronizeProfile &&
      (!knownProfileName ||
        (actor.displayName && actor.displayName !== knownProfileName));
    const name = await runTransaction(
      playerDatabase,
      async (transaction) => {
        const target = reference(code);
        const profileRef = doc(playerDatabase, "monopolyHub/v1/profiles", uid);
        // All reads precede writes; independent reads share the same network wait.
        const [snapshot, profile] = await Promise.all([
          transaction.get(target),
          needsProfileRead ? transaction.get(profileRef) : undefined,
        ]);
        if (!active) throw new HubError("Phiên chơi đã thay đổi. Hãy thử lại.");
        let displayName = knownProfileName || "";
        if (profile) {
          const data = playerProfile(actor, profile.data());
          displayName = data.displayName;
          if (!profile.exists() || profile.data()?.displayName !== displayName)
            transaction.set(profileRef, data);
        }
        const result = change(
          snapshot.exists() ? readRoom(snapshot.data()) : null,
          displayName,
        );
        if (result)
          transaction.set(target, {
            ...result,
            createdAt: snapshot.exists()
              ? snapshot.data().createdAt
              : serverTimestamp(),
          });
        else transaction.delete(target);
        return displayName;
      },
      { maxAttempts: 5 },
    );
    if (synchronizeProfile) knownProfileName = name;
  }
  return {
    uid,
    async create(_name, capacity, title) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          await transact(
            code,
            (room, displayName) => {
              if (room) throw new HubError("code-collision");
              return createRoom(uid, displayName, capacity, title);
            },
            true,
          );
          return code;
        } catch (error) {
          if (
            !(error instanceof HubError) ||
            error.message !== "code-collision"
          )
            throw error;
        }
      }
      throw new HubError("Không tạo được mã phòng. Hãy thử lại.");
    },
    async join(code) {
      await transact(
        code,
        (room, displayName) =>
          applyCommand(room, { type: "join", uid, name: displayName }),
        true,
      );
    },
    command: (code, command) =>
      transact(code, (room) => applyCommand(room, command)),
    watch: (code, update, error) =>
      onSnapshot(
        reference(code),
        (snapshot) => {
          try {
            update(snapshot.exists() ? readRoom(snapshot.data()) : null);
          } catch (e) {
            error(e);
          }
        },
        error,
      ),
    list: (update, error) =>
      onSnapshot(
        query(
          collection(playerDatabase, "monopolyHub/v1/rooms"),
          where("status", "==", "waiting"),
          orderBy("createdAt", "desc"),
          limit(50),
        ),
        (snapshot) => {
          try {
            update(
              snapshot.docs.map((item) => ({
                code: item.id,
                room: readRoom(item.data()),
              })),
            );
          } catch (e) {
            error(e);
          }
        },
        error,
      ),
    dispose() {
      active = false;
    },
  };
}
