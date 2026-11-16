import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../server/app.mjs";

test("API answers /health, refuses unknown origins and has no other HTTP endpoint", async () => {
  let up = true;
  const api = createApi({
    url: "https://example.supabase.co",
    key: "public-test",
    origins: ["https://game.test"],
    ready: () => up,
    request: async () => Response.json({}, { status: 401 }),
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${api.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    up = false;
    assert.equal((await fetch(`${base}/health`)).status, 503);
    up = true;
    assert.equal(
      (
        await fetch(`${base}/anything`, {
          headers: { Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    for (const path of ["/v1/hub", "/anything"])
      assert.equal(
        (await fetch(`${base}${path}`, { method: "POST" })).status,
        404,
      );
    assert.throws(() => createApi({ url: "", key: "", origins: [] }));
  } finally {
    await new Promise((resolve) => api.close(resolve));
  }
});
