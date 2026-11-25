import { createServer } from "node:http";
import { attachSockets } from "./socket.mjs";
import { attachOcean } from "./ocean.mjs";

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
    // A rejected token is "not signed in"; the provider failing is not, and must not
    // end a running game (callers treat a throw as "try again later").
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Auth provider unavailable");
    const user = await response.json();
    return user.id && !user.is_anonymous ? user : null;
  }
  /** Where the boats of the players who are not online were last left, read with a player's own token (no admin key). */
  async function parkedOf(token) {
    const response = await upstream(
      "/rest/v1/rpc/economy_parked_boats",
      token,
      {},
    );
    if (!response.ok) throw new Error("Parked boats unavailable");
    return response.json();
  }
  /** The player's boat and rod tiers, read with the player's own token (the RPC is the player's; no admin key). */
  async function loadoutOf(token) {
    const response = await upstream("/rest/v1/rpc/economy_loadout", token, {});
    if (!response.ok) throw new Error("Loadout unavailable");
    return response.json();
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
    return send(404, { error: "Không tìm thấy." });
  });
  server.io = attachSockets(server, { origins, authenticate, ready });
  attachOcean(server.io, { authenticate, ready, now, loadoutOf, parkedOf });
  return server;
}
