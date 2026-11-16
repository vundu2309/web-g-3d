import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { io as connect } from "socket.io-client";
import { attachSockets } from "../server/socket.mjs";

test("Socket.IO connects only with a token the Auth server accepts, from an allowed origin", async () => {
  const server = createServer();
  let available = true;
  const io = attachSockets(server, {
    origins: ["https://game.test"],
    ready: () => available,
    authenticate: async (token) =>
      token === "valid" ? { id: "player" } : null,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = {
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
  };
  const good = connect(url, { ...options, auth: { token: "valid" } });
  const invalid = connect(url, { ...options, auth: { token: "invalid" } });
  const wrongOrigin = connect(url, {
    ...options,
    auth: { token: "valid" },
    extraHeaders: { Origin: "https://evil.test" },
  });
  try {
    const denied = once(invalid, "connect_error");
    invalid.connect();
    assert.equal((await denied)[0].data.code, "AUTH_REQUIRED");
    const blocked = once(wrongOrigin, "connect_error");
    wrongOrigin.connect();
    await blocked;
    assert.equal(wrongOrigin.connected, false);
    available = false;
    const unavailable = once(good, "connect_error");
    good.connect();
    assert.equal((await unavailable)[0].data.code, "SERVICE_UNAVAILABLE");
    available = true;
    const connected = once(good, "connect");
    good.connect();
    await connected;
    assert.equal(good.connected, true);
  } finally {
    for (const socket of [good, invalid, wrongOrigin]) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});
