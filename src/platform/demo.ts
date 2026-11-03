import { applyCommand, createRoom, generateCode, HubError } from "../hub/model";
import type { Room } from "../hub/model";
import type { RoomStore } from "../hub/store";

const prefix = "photyphu:demo:";
export function createDemoStore(): RoomStore {
  const uid = sessionStorage.getItem(`${prefix}uid`) || crypto.randomUUID();
  sessionStorage.setItem(`${prefix}uid`, uid);
  const listeners = new Set<() => void>();
  const read = (code: string): Room | null =>
    JSON.parse(localStorage.getItem(prefix + code) || "null");
  const write = (code: string, room: Room | null) => {
    if (room) localStorage.setItem(prefix + code, JSON.stringify(room));
    else localStorage.removeItem(prefix + code);
    listeners.forEach((notify) => notify());
  };
  const lock = <T>(fn: () => T): Promise<T> =>
    navigator.locks.request("photyphu-demo", fn);
  const notify = () => listeners.forEach((fn) => fn());
  const storageChanged = (event: StorageEvent) => {
    if (event.storageArea === localStorage && event.key?.startsWith(prefix))
      notify();
  };
  window.addEventListener("storage", storageChanged);
  return {
    uid,
    create: (name, capacity, title) =>
      lock(() => {
        let code = generateCode();
        while (read(code)) code = generateCode();
        write(code, createRoom(uid, name, capacity, title));
        return code;
      }),
    join: (code, name) =>
      lock(() => {
        const room = read(code);
        if (room && Date.now() - room.createdAt > 86400000)
          throw new HubError("Phòng thử đã hết hạn. Hãy tạo phòng mới.");
        write(code, applyCommand(room, { type: "join", uid, name }));
      }),
    command: (code, command) =>
      lock(() => write(code, applyCommand(read(code), command))),
    watch: (code, update, error) => {
      const listener = () => {
        try {
          update(read(code));
        } catch (e) {
          error(e);
        }
      };
      listeners.add(listener);
      queueMicrotask(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    list: (update, error) => {
      const listener = () => {
        try {
          const rooms: { code: string; room: Room }[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            const code = key.slice(prefix.length);
            if (key.startsWith(prefix) && /^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
              const room = read(code);
              if (
                room?.status === "waiting" &&
                Date.now() - room.createdAt < 86400000
              )
                rooms.push({ code, room });
            }
          }
          update(rooms.slice(-50));
        } catch (e) {
          error(e);
        }
      };
      listeners.add(listener);
      queueMicrotask(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      window.removeEventListener("storage", storageChanged);
      listeners.clear();
    },
  };
}
