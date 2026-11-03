import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, onValue, ref } from "firebase/database";
import { applyCommand, createRoom, generateCode, HubError } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";

// Public web-app identifiers, not administrator credentials. Rules enforce access.
const config = {
  apiKey: "AIzaSyA9gP05OxX8ORb4lskBn0Kiw-v7hwIRY2o",
  authDomain: "movieapp-fa2d4.firebaseapp.com",
  databaseURL: "https://movieapp-fa2d4-default-rtdb.firebaseio.com",
  projectId: "movieapp-fa2d4",
  appId: "1:1071572901905:web:090abdc57cd8fbd2ea11b0",
};
export async function createFirebaseStore(): Promise<RoomStore> {
  const app = getApps()[0] || initializeApp(config);
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const db = getDatabase(app);
  const path = (code: string) => `monopolyHub/v1/rooms/${code}`;
  async function transact(
    code: string,
    change: (room: Room | null) => Room | null,
  ) {
    // REST conditional writes avoid deferred offline SDK writes. ETag protects joins/readiness races.
    const token = await user.getIdToken();
    const url = `${config.databaseURL}/${path(code)}.json?auth=${encodeURIComponent(token)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = await fetch(url, {
        headers: { "X-Firebase-ETag": "true" },
        signal: AbortSignal.timeout(10000),
      });
      if (!snapshot.ok)
        throw new HubError(
          "Không đọc được phòng online. Kiểm tra Realtime Database và quyền truy cập.",
        );
      const room = (await snapshot.json()) as Room | null;
      const result = change(room);
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "if-match": snapshot.headers.get("ETag")!,
        },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 412) continue;
      if (!response.ok)
        throw new HubError(
          "Không cập nhật được phòng online. Kiểm tra quyền Realtime Database rồi thử lại.",
        );
      return;
    }
    throw new HubError("Phòng vừa có thay đổi. Hãy thử lại.");
  }
  return {
    uid: user.uid,
    async create(name, capacity) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          await transact(code, (room) => {
            if (room) throw new HubError("code-collision");
            return createRoom(user.uid, name, capacity);
          });
          return code;
        } catch (e) {
          if (!(e instanceof HubError) || e.message !== "code-collision")
            throw e;
        }
      }
      throw new HubError("Không tạo được mã phòng. Hãy thử lại.");
    },
    join: (code, name) =>
      transact(code, (room) =>
        applyCommand(room, { type: "join", uid: user.uid, name }),
      ),
    command: (code, command) =>
      transact(code, (room) => applyCommand(room, command)),
    watch: (code, update, error) =>
      onValue(
        ref(db, path(code)),
        (snapshot) => update(snapshot.val() as Room | null),
        error,
      ),
    dispose() {},
  };
}
