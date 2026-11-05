import { spawn } from "../src/ocean/model.ts";

/**
 * The shared sea is ephemeral on ONE API instance. No room/persistent economy writes.
 *
 * Transport (protocol 2). Clients simulate their own boat and publish its pose; the
 * server only relays. It used to authenticate against Supabase and re-broadcast the
 * whole boat list on every single command, so cost grew with players x commands
 * (and a revoked session could only be noticed at a command). Now:
 *  - a move is a synchronous in-memory write, rate limited per socket;
 *  - one fixed tick sends only what changed since the last tick, in a compact form;
 *  - the session is re-checked on a timer, and a refreshed token can be sent on the
 *    open connection (`ocean:token`) so a long session is not cut when the first
 *    access token expires.
 * Clients that do not announce protocol 2 (an older cached app) keep getting full
 * `ocean:state` snapshots and acknowledged commands, so a rollout is safe in either
 * order.
 */
export const OCEAN_PROTOCOL = 2;
const MAX_BOATS = 100;
const POSE_KEYS = "fishing,heading,x,z";
const round = (value) => Math.round(value * 100) / 100;

export function attachOcean(
  io,
  {
    authenticate,
    ready = () => true,
    now = Date.now,
    /** How often changes are sent; clients publish at the same pace. */
    tickMs = 200,
    /** How often an entered session is re-validated against the Auth provider. */
    authRecheckMs = 60_000,
    /** Minimum gap between two accepted moves of one protocol 2 socket. */
    minMoveMs = 100,
    /** The same for acknowledged commands from an older client. */
    legacyMinMoveMs = 400,
  },
) {
  const boats = new Map();
  const legacyRoom = "ocean:shared";
  const modernRoom = "ocean:v2";
  const dirty = new Set();
  const added = new Set();
  const gone = new Set();
  let timer;
  const snapshot = () => ({
    boats: [...boats.values()].map(({ socket, proto, ...boat }) => boat),
    serverTime: now(),
  });
  const members = (room) => io.sockets.adapter.rooms.get(room)?.size ?? 0;
  /** Sends everything that changed since the last flush, once per room. */
  function flush() {
    if (!dirty.size && !gone.size) return;
    const t = now();
    if (members(modernRoom)) {
      const add = [];
      const up = [];
      for (const uid of dirty) {
        const boat = boats.get(uid);
        if (!boat) continue;
        if (added.has(uid))
          add.push({
            uid,
            name: boat.name,
            x: round(boat.x),
            z: round(boat.z),
            heading: round(boat.heading),
            fishing: boat.fishing,
          });
        else
          up.push([
            uid,
            round(boat.x),
            round(boat.z),
            round(boat.heading),
            boat.fishing ? 1 : 0,
          ]);
      }
      io.to(modernRoom).emit("ocean:delta", { t, add, up, gone: [...gone] });
    }
    if (members(legacyRoom)) io.to(legacyRoom).emit("ocean:state", snapshot());
    dirty.clear();
    added.clear();
    gone.clear();
    if (!boats.size) stopTimer();
  }
  function startTimer() {
    if (timer) return;
    timer = setInterval(flush, tickMs);
    timer.unref?.();
  }
  function stopTimer() {
    clearInterval(timer);
    timer = undefined;
  }
  const validPose = (pose) =>
    pose &&
    Object.keys(pose).sort().join(",") === POSE_KEYS &&
    ["x", "z", "heading"].every(
      (key) => typeof pose[key] === "number" && Number.isFinite(pose[key]),
    ) &&
    Math.abs(pose.x) <= 180 &&
    Math.abs(pose.z) <= 180 &&
    Math.abs(pose.heading) <= Math.PI &&
    typeof pose.fishing === "boolean";

  io.on("connection", (socket) => {
    let joined = false;
    let modern = false;
    let last = -Infinity;
    let lastToken = -Infinity;
    let checking = false;
    let recheck;
    const leaveRooms = (target) => {
      target.leave(legacyRoom);
      target.leave(modernRoom);
    };
    const remove = () => {
      clearInterval(recheck);
      if (boats.get(socket.data.uid)?.session === socket.id) {
        boats.delete(socket.data.uid);
        dirty.delete(socket.data.uid);
        added.delete(socket.data.uid);
        gone.add(socket.data.uid);
        flush();
      }
    };
    socket.on("disconnect", remove);
    /** Applies a pose; returns an error text, or undefined when accepted. */
    function applyMove(pose, minGap) {
      const boat = boats.get(socket.data.uid);
      if (!joined || !boat || boat.session !== socket.id)
        return "Thuyền không còn trong phiên này. Hãy vào lại.";
      const at = now();
      if (at - last < minGap) return "Thao tác quá nhanh.";
      if (!validPose(pose)) return "Vị trí không hợp lệ.";
      last = at;
      Object.assign(boat, pose, { updatedAt: at });
      dirty.add(boat.uid);
      return undefined;
    }
    socket.on("ocean:command", async (input, ack) => {
      if (typeof ack !== "function") return;
      if (!ready())
        return ack({ error: "Biển chung đang kết nối lại. Hãy vào lại sau." });
      if (!input || !["join", "move"].includes(input.action))
        return ack({ error: "Yêu cầu không hợp lệ." });
      if (input.action === "move") {
        const error = applyMove(input.pose, legacyMinMoveMs);
        return ack(error ? { error } : { data: true });
      }
      if (joined) return ack({ error: "Thuyền đã vào biển." });
      if (now() - last < legacyMinMoveMs)
        return ack({ error: "Thao tác quá nhanh." });
      last = now();
      try {
        // One check when entering; after that the timer below owns the session.
        const user = await authenticate(socket.data.token);
        if (!user || user.id !== socket.data.uid) {
          ack({ error: "Hãy đăng nhập lại." });
          socket.disconnect(true);
          return;
        }
        if (!socket.connected) return;
        if (joined) return ack({ error: "Thuyền đã vào biển." });
        if (boats.size >= MAX_BOATS && !boats.has(user.id))
          return ack({
            error: "Biển chung đang đủ 100 thuyền. Hãy thử lại sau.",
          });
        const previous = boats.get(user.id);
        if (previous) {
          previous.socket.emit("ocean:error", {
            error:
              "Tài khoản đã mở thuyền ở cửa sổ khác. Hãy quay về hub rồi vào lại.",
          });
          leaveRooms(previous.socket);
        }
        const pose = spawn(user.id);
        modern = input.proto === OCEAN_PROTOCOL;
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
          proto: modern ? OCEAN_PROTOCOL : 1,
        });
        dirty.add(user.id);
        added.add(user.id);
        joined = true;
        await socket.join(modern ? modernRoom : legacyRoom);
        recheck = setInterval(async () => {
          if (checking) return;
          checking = true;
          try {
            const current = await authenticate(socket.data.token);
            if (!current || current.id !== socket.data.uid) {
              socket.emit("ocean:error", { error: "Hãy đăng nhập lại." });
              socket.disconnect(true);
            }
          } catch {
            // The Auth provider being briefly unreachable must not end the game.
          } finally {
            checking = false;
          }
        }, authRecheckMs);
        recheck.unref?.();
        if (modern) socket.emit("ocean:state", snapshot());
        ack({
          data: modern
            ? {
                pose,
                proto: OCEAN_PROTOCOL,
                sendMs: tickMs,
                delayMs: 1.5 * tickMs,
              }
            : { pose },
        });
        // Entering and leaving are rare, so they go out at once instead of at the tick.
        flush();
        startTimer();
      } catch {
        ack({ error: "Chưa kết nối được biển chung. Hãy vào lại." });
      }
    });
    // Protocol 2 move: no acknowledgement, no round trip. Too-fast moves are dropped
    // (the next one carries the newer pose); only a lost lease is reported.
    socket.on("ocean:move", (pose) => {
      if (!modern || !ready()) return;
      const error = applyMove(pose, minMoveMs);
      if (
        error &&
        error !== "Thao tác quá nhanh." &&
        error !== "Vị trí không hợp lệ."
      )
        socket.emit("ocean:error", { error });
    });
    // A refreshed access token for the open connection, so the session outlives the
    // first token (about one hour) without a reconnect.
    socket.on("ocean:token", async (input, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const token = input?.token;
      if (typeof token !== "string" || token.length > 8192)
        return reply({ error: "Yêu cầu không hợp lệ." });
      if (now() - lastToken < 2000)
        return reply({ error: "Thao tác quá nhanh." });
      lastToken = now();
      try {
        const user = await authenticate(token);
        if (!user || user.id !== socket.data.uid)
          return reply({ error: "Hãy đăng nhập lại." });
        socket.data.token = token;
        reply({ data: true });
      } catch {
        reply({ error: "Chưa xác thực được. Hãy thử lại." });
      }
    });
  });
}
