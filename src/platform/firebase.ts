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
import { syncPlayerProfile } from "./profile";
import { applyCommand, createRoom, generateCode, HubError } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";
function readRoom(data: DocumentData): Room {
  if (!(data.createdAt instanceof Timestamp))
    throw new HubError("Dữ liệu phòng không hợp lệ. Hãy tạo phòng mới.");
  return { ...data, createdAt: data.createdAt.toMillis() } as Room;
}
export async function createFirebaseStore(): Promise<RoomStore> {
  const { user, displayName } = await syncPlayerProfile();
  const reference = (code: string) =>
    doc(playerDatabase, "monopolyHub/v1/rooms", code);
  async function transact(
    code: string,
    change: (room: Room | null) => Room | null,
  ) {
    if ((await currentPlayer())?.uid !== user.uid)
      throw new HubError("Hãy đăng nhập lại.");
    await runTransaction(
      playerDatabase,
      async (transaction) => {
        const target = reference(code);
        const snapshot = await transaction.get(target);
        const result = change(
          snapshot.exists() ? readRoom(snapshot.data()) : null,
        );
        if (result)
          transaction.set(target, {
            ...result,
            createdAt: snapshot.exists()
              ? snapshot.data().createdAt
              : serverTimestamp(),
          });
        else transaction.delete(target);
      },
      { maxAttempts: 5 },
    );
  }
  return {
    uid: user.uid,
    async create(_name, capacity, title) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          await transact(code, (room) => {
            if (room) throw new HubError("code-collision");
            return createRoom(user.uid, displayName, capacity, title);
          });
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
    join: (code) =>
      transact(code, (room) =>
        applyCommand(room, { type: "join", uid: user.uid, name: displayName }),
      ),
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
    dispose() {},
  };
}
