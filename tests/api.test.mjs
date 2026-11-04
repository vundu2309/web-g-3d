import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../server/app.mjs";

test("API verifies Auth, ignores client uid, rejects origins/tokens and hides upstream internals", async () => {
  const calls = [];
  let authOk = true;
  let dbOk = true;
  const api = createApi({
    url: "https://example.supabase.co",
    key: "public-test",
    origins: ["https://game.test"],
    request: async (url, options) => {
      calls.push({ url, options });
      return url.endsWith("/user")
        ? Response.json(authOk ? { id: "verified-user" } : {}, {
            status: authOk ? 200 : 401,
          })
        : Response.json(
            dbOk
              ? { room: { hostId: "verified-user" } }
              : { code: "XX000", message: "internal secret" },
            { status: dbOk ? 200 : 500 },
          );
    },
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${api.address().port}/v1/hub`;
  const send = (body, headers = {}) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await send({ action: "list" }, { Origin: "https://evil.test" })).status,
      403,
    );
    assert.equal(
      (await send({ action: "list" }, { Authorization: "" })).status,
      401,
    );
    assert.equal(calls.length, 0);
    authOk = false;
    assert.equal((await send({ action: "list" })).status, 401);
    assert.equal(calls.length, 1);
    authOk = true;
    const response = await send(
      { action: "start", code: "ABCDEF", uid: "victim" },
      { Origin: "https://game.test" },
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://game.test",
    );
    const rpc = JSON.parse(calls.at(-1).options.body);
    assert.equal(rpc.p_action, "start");
    assert.equal("uid" in rpc, false);
    assert.equal(
      calls.at(-1).options.headers.Authorization,
      "Bearer test-token",
    );
    dbOk = false;
    const failed = await send({ action: "list" });
    assert.equal(failed.status, 503);
    assert.equal((await failed.text()).includes("internal secret"), false);
  } finally {
    await new Promise((resolve) => api.close(resolve));
  }
});
