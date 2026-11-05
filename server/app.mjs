import { createServer } from "node:http";
import { attachSockets } from "./socket.mjs";

export function createApi({
  url,
  key,
  origins,
  request = fetch,
  now = Date.now,
  ready = () => true,
}) {
  if (!url || !key || !origins?.length)
    throw new Error("Missing API configuration");
  const allowed = new Set(origins);
  const limits = new Map();
  async function upstream(path, token, body) {
    return request(`${url}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
  }
  async function authenticate(token) {
    const response = await upstream("/auth/v1/user", token);
    if (!response.ok) return null;
    const user = await response.json();
    return user.id && !user.is_anonymous ? user : null;
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/health" && req.method === "GET")
      return send(ready() ? 200 : 503, { ok: ready() });
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin))
      return send(403, { error: "Origin không được phép." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (!ready())
      return send(503, {
        error: "Dịch vụ phòng đang kết nối database. Hãy thử lại.",
      });
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return send(204, null);
    }
    if (req.url !== "/v1/hub" || req.method !== "POST")
      return send(404, { error: "Không tìm thấy." });
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]+)$/,
    )?.[1];
    if (!token || token.length > 8192)
      return send(401, { error: "Hãy đăng nhập lại." });
    try {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "Cần dữ liệu JSON." });
      let raw = "";
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) {
          send(413, { error: "Dữ liệu quá dài." });
          req.resume();
          return;
        }
        raw += chunk;
      }
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        return send(400, { error: "JSON không hợp lệ." });
      }
      if (
        !input ||
        !["create", "join", "ready", "leave", "start", "get", "list"].includes(
          input.action,
        )
      )
        return send(400, { error: "Thao tác không hợp lệ." });
      // Validate the access token with the configured Auth server, never decoded claims alone.
      const auth = await upstream("/auth/v1/user", token);
      if (!auth.ok)
        return send(auth.status >= 500 ? 503 : 401, {
          error: "Không xác thực được phiên đăng nhập.",
        });
      const user = await auth.json();
      if (!user.id || user.is_anonymous)
        return send(401, { error: "Hãy đăng nhập lại." });
      for (const [id, entry] of limits)
        if (entry.until <= now()) limits.delete(id);
      const rate = limits.get(user.id) || { count: 0, until: now() + 60000 };
      if (++rate.count > 120)
        return send(429, { error: "Thao tác quá nhanh. Hãy đợi một lúc." });
      if (limits.size >= 10000 && !limits.has(user.id))
        return send(503, { error: "Dịch vụ đang bận." });
      limits.set(user.id, rate);
      const result = await upstream("/rest/v1/rpc/hub_command", token, {
        p_action: input.action,
        p_code: input.code ?? null,
        p_name: input.name ?? null,
        p_title: input.title ?? null,
        p_capacity: input.capacity ?? null,
        p_ready: input.ready ?? null,
      });
      const data = await result.json();
      if (!result.ok) {
        if (data.code === "23505")
          return send(409, { error: "code-collision" });
        const expected = ["22023", "42501", "28000"].includes(data.code);
        return send(expected ? 400 : 503, {
          error: expected
            ? data.message
            : "Không hoàn tất được thao tác. Hãy thử lại.",
        });
      }
      send(200, { data });
    } catch {
      send(503, { error: "Không kết nối được dịch vụ phòng. Hãy thử lại." });
    }
  });
  server.io = attachSockets(server, {
    origins,
    authenticate,
    ready,
    snapshot: async (token, input) => {
      const response = await upstream("/rest/v1/rpc/hub_command", token, {
        p_action: input.action,
        p_code: input.code ?? null,
      });
      if (!response.ok) throw new Error("Snapshot rejected");
      return response.json();
    },
  });
  return server;
}
