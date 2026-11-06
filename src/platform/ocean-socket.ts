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
    authListener.subscription.unsubscribe();
    socket.removeAllListeners();
    socket.disconnect();
  };
  signal.addEventListener("abort", dispose, { once: true });
  // The server sends a full snapshot on entry and periodically, and deltas in between.
  const known = new Map<string, Boat>();
  socket.on(
    "ocean:state",
    (value: {
      full?: boolean;
      boats: Record<string, unknown>[];
      removed?: unknown;
      serverTime: number;
    }) => {
      if (
        disposed ||
        !Array.isArray(value?.boats) ||
        !Number.isFinite(value.serverTime)
      )
        return;
      if (value.full === true) known.clear();
      if (Array.isArray(value.removed))
        for (const uid of value.removed) known.delete(String(uid));
      for (const item of value.boats.slice(0, 100)) {
        if (typeof item.uid !== "string" || typeof item.updatedAt !== "number")
          continue;
        const boat = readBoat(item.uid, {
          ...item,
          updatedAt: { toMillis: () => item.updatedAt as number },
        });
        if (boat) known.set(boat.uid, boat);
      }
      onBoats([...known.values()].slice(0, 100), value.serverTime);
    },
  );
  // Keep the server's copy of the Auth token fresh so long trips are not cut off.
  const { data: authListener } = supabase().auth.onAuthStateChange(
    (event, session) => {
      if (
        disposed ||
        event !== "TOKEN_REFRESHED" ||
        session?.user.id !== user.uid ||
        !socket.connected
      )
        return;
      socket.emit("ocean:token", { token: session.access_token }, () => {});
    },
  );
  socket.on("ocean:error", (value: { error: string }) =>
    onError(new HubError(value.error)),
  );
  socket.on("disconnect", () => {
    if (!disposed)
      onError(new HubError("Mất kết nối biển chung. Hãy về hub rồi vào lại."));
  });
  async function command(action: string, pose?: Pose) {
    if (disposed || !socket.connected) throw new HubError("Đã rời biển.");
    const result = (await socket
      .timeout(12000)
      .emitWithAck("ocean:command", { action, ...(pose ? { pose } : {}) })) as {
      data?: { pose: Pose };
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
      socket.once("connect_error", () => {
        signal.removeEventListener("abort", aborted);
        reject(new HubError("Chưa kết nối được biển chung. Hãy thử lại."));
      });
      socket.connect();
    });
    const data = await command("join");
    if (!data?.pose || signal.aborted) throw new HubError("Đã rời biển.");
    return {
      uid: user.uid,
      pose: data.pose,
      dispose,
      publish: async (pose: Pose) => {
        if (inFlight || disposed) return;
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
