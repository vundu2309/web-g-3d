import { Server } from "socket.io";

// Push invalidations only. Authorized snapshots always come from PostgreSQL.
export function attachSockets(
  server,
  { origins, authenticate, snapshot, ready = () => true },
) {
  const allowed = new Set(origins);
  const io = new Server(server, {
    transports: ["websocket"],
    maxHttpBufferSize: 4096,
    cors: { origin: origins },
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || allowed.has(req.headers.origin)),
  });
  io.use(async (socket, next) => {
    const reject = (code) => {
      const error = new Error(
        code === "AUTH_REQUIRED"
          ? "Hãy đăng nhập lại."
          : "Dịch vụ phòng đang kết nối lại.",
      );
      error.data = { code };
      next(error);
    };
    if (!ready()) return reject("SERVICE_UNAVAILABLE");
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length > 8192)
        return reject("AUTH_REQUIRED");
      const user = await authenticate(token);
      if (!user) return reject("AUTH_REQUIRED");
      socket.data.token = token;
      socket.data.uid = user.id;
      next();
    } catch {
      reject("SERVICE_UNAVAILABLE");
    }
  });
  io.on("connection", (socket) => {
    let pending = false;
    let count = 0;
    let windowEnd = Date.now() + 60000;
    socket.on("hub:snapshot", async (input, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      if (Date.now() > windowEnd) {
        count = 0;
        windowEnd = Date.now() + 60000;
      }
      if (pending || ++count > 120)
        return acknowledge({ error: "Thao tác quá nhanh. Hãy đợi một lúc." });
      if (
        !input ||
        !["get", "list"].includes(input.action) ||
        (input.action === "get" && !/^[A-HJ-NP-Z2-9]{6}$/.test(input.code))
      )
        return acknowledge({ error: "Yêu cầu không hợp lệ." });
      pending = true;
      try {
        // Revalidate on every read; a connected socket is not a permanent Auth grant.
        const user = await authenticate(socket.data.token);
        if (!user || user.id !== socket.data.uid) {
          acknowledge({ error: "Hãy đăng nhập lại." });
          socket.disconnect(true);
          return;
        }
        const data = await snapshot(socket.data.token, input);
        acknowledge({ data });
      } catch {
        acknowledge({ error: "Không tải được phòng. Hãy kết nối lại." });
      } finally {
        pending = false;
      }
    });
  });
  return io;
}
