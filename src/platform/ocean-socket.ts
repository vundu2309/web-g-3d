import { io } from "socket.io-client";
import { supabase } from "./supabase-client";
import { currentPlayer } from "./account";
import { HubError } from "../hub/model";
import { readBoat, type Boat, type Pose } from "../ocean/model";
export async function connectOcean(
  onBoats: (boats: Boat[], serverTime: number) => void,
  onError: (error: unknown) => void,
  signal: AbortSignal,
) {
  const user = await currentPlayer();
  if (!user || signal.aborted) throw new HubError("Hãy đăng nhập để ra khơi.");
  const base = import.meta.env.VITE_API_URL;
  if (!base) throw new HubError("Chưa cấu hình kết nối biển chung.");
  let disposed = false;
  let inFlight = false;
  const socket = io(base, {
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
    auth: (callback) => {
      void supabase()
        .auth.getSession()
        .then(({ data }) =>
          callback({
            token:
              data.session?.user.id === user.uid
                ? data.session.access_token
                : "",
          }),
        )
        .catch(() => callback({ token: "" }));
    },
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    socket.removeAllListeners();
    socket.disconnect();
  };
  signal.addEventListener("abort", dispose, { once: true });
  socket.on(
    "ocean:state",
    (value: { boats: Record<string, unknown>[]; serverTime: number }) => {
      if (
        disposed ||
        !Array.isArray(value?.boats) ||
        !Number.isFinite(value.serverTime)
      )
        return;
      const boats = value.boats.slice(0, 100).flatMap((item) => {
        if (typeof item.uid !== "string" || typeof item.updatedAt !== "number")
          return [];
        const boat = readBoat(item.uid, {
          ...item,
          updatedAt: { toMillis: () => item.updatedAt as number },
        });
        return boat ? [boat] : [];
      });
      fleet.clear();
      for (const boat of boats) fleet.set(boat.uid, boat);
      onBoats(boats, value.serverTime);
    },
  );
  // Protocol 2: a full snapshot on entering, then only what changed each tick.
  const fleet = new Map<string, Boat>();
  const publishBoats = (serverTime: number) =>
    onBoats([...fleet.values()].slice(0, 100), serverTime);
  socket.on(
    "ocean:delta",
    (value: {
      t: number;
      add?: Record<string, unknown>[];
      up?: unknown[][];
      gone?: string[];
    }) => {
      if (disposed || !Number.isFinite(value?.t)) return;
      const at = value.t;
      // When a boat moved, if the server says (older servers do not: the tick then).
      const movedAt = (stamp: unknown) =>
        typeof stamp === "number" && Number.isFinite(stamp) && stamp <= at
          ? stamp
          : at;
      for (const item of Array.isArray(value.add) ? value.add : []) {
        if (typeof item?.uid !== "string") continue;
        const boat = readBoat(item.uid, {
          ...item,
          session: "",
          updatedAt: { toMillis: () => movedAt(item.updatedAt) },
        });
        if (boat) fleet.set(boat.uid, boat);
      }
      for (const row of Array.isArray(value.up) ? value.up : []) {
        const [uid, x, z, heading, fishing, moved] = row ?? [];
        const known = typeof uid === "string" ? fleet.get(uid) : undefined;
        if (
          !known ||
          ![x, z, heading].every(
            (n) => typeof n === "number" && Number.isFinite(n),
          )
        )
          continue;
        const next = readBoat(known.uid, {
          ...known,
          x,
          z,
          heading,
          fishing: fishing === 1,
          updatedAt: { toMillis: () => movedAt(moved) },
        });
        if (next) fleet.set(next.uid, next);
      }
      for (const uid of Array.isArray(value.gone) ? value.gone : [])
        fleet.delete(uid);
      publishBoats(at);
    },
  );
  socket.on("ocean:error", (value: { error: string }) =>
    onError(new HubError(value.error)),
  );
  socket.on("disconnect", () => {
    if (!disposed)
      onError(new HubError("Mất kết nối biển chung. Hãy về hub rồi vào lại."));
  });
  interface Joined {
    pose: Pose;
    proto?: number;
    sendMs?: number;
    delayMs?: number;
  }
  async function command(action: string, pose?: Pose) {
    if (disposed || !socket.connected) throw new HubError("Đã rời biển.");
    const result = (await socket.timeout(12000).emitWithAck("ocean:command", {
      action,
      ...(action === "join" ? { proto: 2 } : {}),
      ...(pose ? { pose } : {}),
    })) as {
      data?: Joined;
      error?: string;
    };
    if (result.error) throw new HubError(result.error);
    return result.data;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const aborted = () => reject(new HubError("Đã rời biển."));
      signal.addEventListener("abort", aborted, { once: true });
      socket.once("connect", () => {
        signal.removeEventListener("abort", aborted);
        resolve();
      });
      socket.once(
        "connect_error",
        (error: Error & { data?: { code?: string } }) => {
          signal.removeEventListener("abort", aborted);
          // The server says why; a revoked or expired session must not be retried.
          reject(
            new HubError(
              error.data?.code === "AUTH_REQUIRED"
                ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
                : "Chưa kết nối được biển chung. Hãy thử lại.",
            ),
          );
        },
      );
      socket.connect();
    });
    const data = (await command("join")) as Joined | undefined;
    if (!data?.pose || signal.aborted) throw new HubError("Đã rời biển.");
    const modern = data.proto === 2;
    // A server that only speaks the older protocol keeps its one-per-second pace.
    const sendMs = modern ? Math.max(100, data.sendMs ?? 200) : 1000;
    const delayMs = modern ? Math.max(150, data.delayMs ?? 300) : 1300;
    // Keep the open connection signed in: the access token is renewed about hourly,
    // and the server checks the session on a timer.
    const { data: listener } = supabase().auth.onAuthStateChange(
      (_event, session) => {
        if (disposed || !modern || session?.user.id !== user.uid) return;
        socket.emit("ocean:token", { token: session.access_token });
      },
    );
    signal.addEventListener(
      "abort",
      () => listener.subscription.unsubscribe(),
      {
        once: true,
      },
    );
    return {
      uid: user.uid,
      pose: data.pose,
      sendMs,
      delayMs,
      dispose: () => {
        listener.subscription.unsubscribe();
        dispose();
      },
      publish: async (pose: Pose) => {
        if (disposed) return;
        if (modern) {
          // No acknowledgement: nothing waits on the network round trip.
          if (socket.connected) socket.volatile.emit("ocean:move", pose);
          return;
        }
        if (inFlight) return;
        inFlight = true;
        try {
          await command("move", pose);
        } finally {
          inFlight = false;
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
