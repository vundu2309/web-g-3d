import { spawn } from "../src/ocean/model.ts";

// The shared sea is ephemeral on ONE API instance. No room/persistent economy writes.
export function attachOcean(
  io,
  { authenticate, ready = () => true, now = Date.now },
) {
  const boats = new Map();
  const channel = "ocean:shared";
  const snapshot = () => ({
    boats: [...boats.values()].map(({ socket, ...boat }) => boat),
    serverTime: now(),
  });
  const broadcast = () => io.to(channel).emit("ocean:state", snapshot());
  io.on("connection", (socket) => {
    let pending = false;
    let last = 0;
    let joined = false;
    const remove = () => {
      if (boats.get(socket.data.uid)?.session === socket.id) {
        boats.delete(socket.data.uid);
        broadcast();
      }
    };
    socket.on("disconnect", remove);
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
        const user = await authenticate(socket.data.token);
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
          await socket.join(channel);
          ack({ data: { pose } });
          broadcast();
        } else {
          const boat = boats.get(user.id);
          if (!joined || !boat || boat.session !== socket.id)
            return ack({
              error: "Thuyền không còn trong phiên này. Hãy vào lại.",
            });
          Object.assign(boat, input.pose, { updatedAt: now() });
          ack({ data: true });
          broadcast();
        }
      } catch {
        ack({ error: "Chưa kết nối được biển chung. Hãy vào lại." });
      } finally {
        pending = false;
      }
    });
  });
}
