import { Server } from "socket.io";

// One Socket.IO server: every connection must carry a Supabase access token that the Auth
// server accepts. The shared sea (ocean.mjs) adds its own events on top.
export function attachSockets(
  server,
  { origins, authenticate, ready = () => true },
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
          : "Dịch vụ đang kết nối lại.",
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
  return io;
}
