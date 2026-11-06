import { spawn } from "../src/ocean/model.ts";

// The shared sea is ephemeral on ONE API instance. No room/persistent economy writes.
const publicBoat = ({ socket, ...boat }) => boat;
// Read `exp` from a token Supabase Auth already validated; this is not signature verification.
const expiry = (token) => {
  try {
    const exp = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString(),
    ).exp;
    return Number.isFinite(exp) ? exp * 1000 : Infinity;
  } catch {
    return Infinity;
  }
};

// tickMs: fixed broadcast cadence. fullMs: periodic full snapshot that self-heals clients.
// recheckMs: how long a validated token is trusted before Supabase Auth is asked again.
export function attachOcean(
  io,
  {
    authenticate,
    ready = () => true,
    now = Date.now,
    tickMs = 200,
    fullMs = 10000,
    recheckMs = 300000,
  },
) {
  const boats = new Map();
  const changed = new Set();
  const removed = new Set();
  const channel = "ocean:shared";
  let lastFull = now();
  const full = () => ({
    full: true,
    boats: [...boats.values()].map(publicBoat),
    removed: [],
    serverTime: now(),
  });
  const touch = (uid) => {
    changed.add(uid);
    removed.delete(uid);
  };
  const drop = (uid) => {
    boats.delete(uid);
    changed.delete(uid);
    removed.add(uid);
  };
  const tick = () => {
    if (now() - lastFull >= fullMs) {
      lastFull = now();
      changed.clear();
      removed.clear();
      if (boats.size) io.to(channel).emit("ocean:state", full());
      return;
    }
    if (!changed.size && !removed.size) return;
    const payload = {
      full: false,
      boats: [...changed].flatMap((uid) =>
        boats.has(uid) ? [publicBoat(boats.get(uid))] : [],
      ),
      removed: [...removed],
      serverTime: now(),
    };
    changed.clear();
    removed.clear();
    io.to(channel).emit("ocean:state", payload);
  };
  const timer = setInterval(tick, tickMs);
  timer.unref();
  io.httpServer?.on("close", () => clearInterval(timer));
  io.on("connection", (socket) => {
    let pending = false;
    let last = 0;
    let joined = false;
    let lastToken = 0;
    socket.data.exp = expiry(socket.data.token);
    socket.data.authAt = now();
    const remove = () => {
      if (boats.get(socket.data.uid)?.session === socket.id)
        drop(socket.data.uid);
    };
    socket.on("disconnect", remove);
    // The client sends its refreshed Auth token so long trips outlive the first token.
    socket.on("ocean:token", async (input, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (typeof input?.token !== "string" || input.token.length > 8192)
        return reply({ error: "Yêu cầu không hợp lệ." });
      if (now() - lastToken < 5000)
        return reply({ error: "Thao tác quá nhanh." });
      lastToken = now();
      try {
        const user = await authenticate(input.token);
        if (!user || user.id !== socket.data.uid) {
          reply({ error: "Hãy đăng nhập lại." });
          socket.disconnect(true);
          return;
        }
        socket.data.token = input.token;
        socket.data.exp = expiry(input.token);
        socket.data.authAt = now();
        reply({ data: true });
      } catch {
        reply({ error: "Chưa làm mới được phiên. Hãy thử lại." });
      }
    });
    socket.on("ocean:command", async (input, ack) => {
      if (typeof ack !== "function") return;
      if (!ready())
        return ack({ error: "Biển chung đang kết nối lại. Hãy vào lại sau." });
      if (pending || now() - last < 400)
        return ack({ error: "Thao tác quá nhanh." });
      if (!input || !["join", "move"].includes(input.action))
        return ack({ error: "Yêu cầu không hợp lệ." });
      if (
        input.action === "move" &&
        (!input.pose ||
          Object.keys(input.pose).sort().join(",") !== "fishing,heading,x,z" ||
          !["x", "z", "heading"].every(
            (key) =>
              typeof input.pose[key] === "number" &&
              Number.isFinite(input.pose[key]),
          ) ||
          Math.abs(input.pose.x) > 180 ||
          Math.abs(input.pose.z) > 180 ||
          Math.abs(input.pose.heading) > Math.PI ||
          typeof input.pose.fishing !== "boolean")
      )
        return ack({ error: "Vị trí không hợp lệ." });
      pending = true;
      last = now();
      try {
        // Joining always asks Auth; moves reuse a recent validation instead of one call per move.
        const stale =
          input.action === "join" ||
          now() >= socket.data.exp ||
          now() - socket.data.authAt >= recheckMs;
        const user = stale
          ? await authenticate(socket.data.token)
          : { id: socket.data.uid };
        if (stale && user) socket.data.authAt = now();
        if (!user || user.id !== socket.data.uid) {
          ack({ error: "Hãy đăng nhập lại." });
          socket.disconnect(true);
          return;
        }
        if (!socket.connected) return;
        if (input.action === "join") {
          if (joined) return ack({ error: "Thuyền đã vào biển." });
          if (boats.size >= 100 && !boats.has(user.id))
            return ack({
              error: "Biển chung đang đủ 100 thuyền. Hãy thử lại sau.",
            });
          const previous = boats.get(user.id);
          if (previous) {
            previous.socket.emit("ocean:error", {
              error:
                "Tài khoản đã mở thuyền ở cửa sổ khác. Hãy quay về hub rồi vào lại.",
            });
            previous.socket.leave(channel);
          }
          const pose = spawn(user.id);
          boats.set(user.id, {
            uid: user.id,
            name:
              String(user.user_metadata?.display_name || "Người đi biển")
                .trim()
                .slice(0, 24) || "Người đi biển",
            session: socket.id,
            ...pose,
            updatedAt: now(),
            socket,
          });
          joined = true;
          touch(user.id);
          await socket.join(channel);
          ack({ data: { pose } });
          socket.emit("ocean:state", full());
        } else {
          const boat = boats.get(user.id);
          if (!joined || !boat || boat.session !== socket.id)
            return ack({
              error: "Thuyền không còn trong phiên này. Hãy vào lại.",
            });
          Object.assign(boat, input.pose, { updatedAt: now() });
          touch(user.id);
          ack({ data: true });
        }
      } catch {
        ack({ error: "Chưa kết nối được biển chung. Hãy vào lại." });
      } finally {
        pending = false;
      }
    });
  });
}
