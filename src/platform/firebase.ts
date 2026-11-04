import type { Trace } from "../hub/diagnostics";
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
import { currentPlayer } from "./firebase-account";
import { playerProfile } from "./profile";
import { applyCommand, createRoom, generateCode, HubError } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";
function readRoom(data: DocumentData): Room {
  if (!(data.createdAt instanceof Timestamp))
    throw new HubError("Dữ liệu phòng không hợp lệ. Hãy tạo phòng mới.");
  return { ...data, createdAt: data.createdAt.toMillis() } as Room;
}
export async function createFirebaseStore(trace?: Trace): Promise<RoomStore> {
  const user = await (trace
    ? trace.measure("session", currentPlayer)
    : currentPlayer());
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
    trace?: Trace,
  ) {
    const actor = await (trace
      ? trace.measure("session", currentPlayer)
      : currentPlayer());
    if (trace && actor) await trace.measure("token", () => actor.getIdToken());
    if (!active || actor?.uid !== uid) throw new HubError("Hãy đăng nhập lại.");
    const needsProfileRead =
      synchronizeProfile &&
      (!knownProfileName ||
        (actor.displayName && actor.displayName !== knownProfileName));
    let endCommit: ReturnType<Trace["begin"]> | undefined;
    const execute = () =>
      runTransaction(
        playerDatabase,
        async (transaction) => {
          endCommit?.("retry");
          endCommit = undefined;
          const attempt = trace?.attempt();
          const target = reference(code);
          const profileRef = doc(
            playerDatabase,
            "monopolyHub/v1/profiles",
            uid,
          );
          // All reads precede writes; independent reads share the same network wait.
          const [snapshot, profile] = await Promise.all([
            trace
              ? trace.measure(
                  "room_read",
                  () => transaction.get(target),
                  attempt,
                )
              : transaction.get(target),
            needsProfileRead
              ? trace
                ? trace.measure(
                    "profile_read",
                    () => transaction.get(profileRef),
                    attempt,
                  )
                : transaction.get(profileRef)
              : undefined,
          ]);
          if (!active)
            throw new HubError("Phiên chơi đã thay đổi. Hãy thử lại.");
          const prepare = () => {
            let displayName = knownProfileName || "";
            if (profile) {
              const data = playerProfile(actor, profile.data());
              displayName = data.displayName;
              if (
                !profile.exists() ||
                profile.data()?.displayName !== displayName
              )
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
          };
          const displayName = trace
            ? trace.sync("prepare", prepare, attempt)
            : prepare();
          endCommit = trace?.begin("commit_wait", attempt);
          return displayName;
        },
        { maxAttempts: 5 },
      );
    try {
      const name = await (trace
        ? trace.measure("transaction", execute)
        : execute());
      endCommit?.();
      if (synchronizeProfile) knownProfileName = name;
    } catch (error) {
      endCommit?.("error", error);
      throw error;
    }
  }
  return {
    uid,
    async create(_name, capacity, title, trace) {
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
            trace,
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
    async join(code, _name, trace) {
      await transact(
        code,
        (room, displayName) =>
          applyCommand(room, { type: "join", uid, name: displayName }),
        true,
        trace,
      );
    },
    command: (code, command) =>
      transact(code, (room) => applyCommand(room, command)),
    watch: (code, update, error) =>
      onSnapshot(
        reference(code),
        { includeMetadataChanges: true },
        (snapshot) => {
          try {
            update(
              snapshot.exists() ? readRoom(snapshot.data()) : null,
              snapshot.metadata.fromCache,
            );
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
