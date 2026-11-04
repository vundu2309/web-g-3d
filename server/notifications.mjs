import pg from "pg";

// Every API instance LISTENs to the same committed database notifications.
// Notifications contain no room data. Reconnection invalidates all snapshots,
// recovering missed messages from durable room state without client polling.
export function listenForChanges({
  connectionString,
  changed,
  ready,
  Client = pg.Client,
}) {
  if (!connectionString)
    throw new Error("DATABASE_URL is required for Socket.IO notifications");
  const databaseUrl = new URL(connectionString);
  // pg connection-string SSL options can override the ssl object. Enforce
  // certificate verification even if a copied dashboard URL uses sslmode=require.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    databaseUrl.searchParams.delete(key);
  let stopped = false;
  let client;
  let retry;
  let connected = false;
  async function connect() {
    if (stopped) return;
    const current = new Client({
      connectionString: databaseUrl.toString(),
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });
    client = current;
    let failed = false;
    function reconnect() {
      if (failed) return;
      failed = true;
      connected = false;
      ready(false);
      void current.end().catch(() => {});
      if (!stopped) retry = setTimeout(() => void connect(), 2000);
    }
    current.on("error", reconnect);
    current.on("end", reconnect);
    current.on("notification", (message) => {
      if (message.channel === "hub_changes") changed();
    });
    try {
      await current.connect();
      await current.query("LISTEN hub_changes");
      if (stopped) {
        await current.end();
        return;
      }
      connected = true;
      ready(true);
      changed();
    } catch {
      reconnect();
    }
  }
  void connect();
  return {
    isReady: () => connected,
    async close() {
      stopped = true;
      clearTimeout(retry);
      await client?.end().catch(() => {});
    },
  };
}
