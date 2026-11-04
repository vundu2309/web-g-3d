import { io } from "socket.io-client";
import { supabase } from "./supabase-client";
import { currentPlayer } from "./account";
import { generateCode, HubError, roomCode } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";
type Snapshot = { code: string; room: Room; version: number };
export async function createApiStore(): Promise<RoomStore> {
  const user = await currentPlayer();
  if (!user) throw new HubError("Hãy đăng nhập để chơi online.");
  const base = import.meta.env.VITE_API_URL;
  if (!base) throw new HubError("Dịch vụ phòng chưa được cấu hình.");
  let active = true;
  const stops = new Set<() => void>();
  async function call<T>(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const { data, error } = await supabase().auth.getSession();
    if (error) throw error;
    if (!active || data.session?.user.id !== user!.uid)
      throw new HubError("Hãy đăng nhập lại.");
    const response = await fetch(`${base}/v1/hub`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(input),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok)
      throw new HubError(result.error || "Không kết nối được dịch vụ phòng.");
    return result.data;
  }
  function subscribe<T>(
    input: Record<string, unknown>,
    update: (value: T) => void,
    error: (error: unknown) => void,
  ) {
    let stopped = false;
    let pending = false;
    let dirty = false;
    let previous: string | undefined;
    // Each subscription owns its socket, handlers and reconnect lifecycle.
    const socket = io(base, {
      transports: ["websocket"],
      autoConnect: false,
      auth: (callback) => {
        void supabase()
          .auth.getSession()
          .then(({ data }) => {
            callback({
              token:
                data.session?.user.id === user!.uid
                  ? data.session.access_token
                  : "",
            });
          });
      },
    });
    async function refresh() {
      if (stopped || !socket.connected) return;
      if (pending) {
        dirty = true;
        return;
      }
      pending = true;
      try {
        const result = (await socket
          .timeout(15000)
          .emitWithAck("hub:snapshot", input)) as { data: T; error?: string };
        if (stopped) return;
        if (result.error) throw new HubError(result.error);
        const serialized = JSON.stringify(result.data);
        if (previous !== serialized) {
          previous = serialized;
          update(result.data);
        }
      } catch (e) {
        if (!stopped) error(e);
      } finally {
        pending = false;
        if (dirty) {
          dirty = false;
          void refresh();
        }
      }
    }
    socket.on("connect", () => void refresh());
    socket.on("hub:changed", () => void refresh());
    socket.on("hub:unavailable", () => {
      if (!stopped)
        error(new HubError("Dịch vụ phòng đang kết nối lại database…"));
    });
    socket.on("connect_error", () => {
      if (!stopped) error(new HubError("Mất kết nối phòng. Đang kết nối lại…"));
    });
    socket.on("disconnect", () => {
      if (!stopped) error(new HubError("Mất kết nối phòng. Đang kết nối lại…"));
    });
    const { data: authListener } = supabase().auth.onAuthStateChange(
      (event) => {
        if (event === "TOKEN_REFRESHED" && !stopped) {
          socket.disconnect();
          socket.connect();
        }
      },
    );
    const stop = () => {
      stopped = true;
      socket.removeAllListeners();
      socket.disconnect();
      authListener.subscription.unsubscribe();
      stops.delete(stop);
    };
    stops.add(stop);
    socket.connect();
    return stop;
  }
  return {
    uid: user.uid,
    async create(name, capacity, title) {
      for (let i = 0; i < 5; i++) {
        const code = generateCode();
        try {
          await call({ action: "create", code, name, capacity, title });
          return code;
        } catch (e) {
          if (!(e instanceof HubError) || e.message !== "code-collision")
            throw e;
        }
      }
      throw new HubError("Không tạo được mã phòng. Hãy thử lại.");
    },
    async join(code, name) {
      await call({ action: "join", code: roomCode(code), name });
    },
    async command(code, command) {
      await call({
        action: command.type,
        code: roomCode(code),
        ...(command.type === "ready" ? { ready: command.ready } : {}),
      });
    },
    watch(code, update, error) {
      return subscribe<Snapshot | null>(
        { action: "get", code: roomCode(code) },
        (snapshot) => update(snapshot?.room || null, false),
        error,
      );
    },
    list(update, error) {
      return subscribe<Snapshot[]>({ action: "list" }, update, error);
    },
    dispose() {
      active = false;
      for (const stop of stops) stop();
    },
  };
}
