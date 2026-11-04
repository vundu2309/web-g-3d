import { readFileSync } from "node:fs";
import pg from "pg";

// Every API instance LISTENs to the same committed database notifications.
// Notifications contain no room data. Reconnection invalidates all snapshots,
// recovering missed messages from durable room state without client polling.
export function listenForChanges({
  connectionString,
  changed,
  ready,
  Client = pg.Client,
  log = (reason) => console.warn(`Database listener: ${reason}`),
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
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL("./supabase-root-ca.crt", import.meta.url),
          "utf8",
        ),
      },
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });
    client = current;
    let failed = false;
    function reconnect(error) {
      if (failed) return;
      failed = true;
      connected = false;
      ready(false);
      if (!stopped) {
        const known = [
          "ENETUNREACH",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "ENOTFOUND",
          "CERT_HAS_EXPIRED",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "SELF_SIGNED_CERT_IN_CHAIN",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "ERR_TLS_CERT_ALTNAME_INVALID",
          "28P01",
          "28000",
          "53300",
          "57P03",
        ];
        const message =
          typeof error?.message === "string" ? error.message.toLowerCase() : "";
        const reason = known.includes(error?.code)
          ? error.code
          : message.includes("tenant or user not found")
            ? "TENANT_OR_USER_NOT_FOUND"
            : message.includes("password authentication failed")
              ? "INVALID_PASSWORD"
              : message.includes("certificate")
                ? "CERTIFICATE_ERROR"
                : "CONNECTION_FAILED";
        log(reason);
      }
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
    } catch (error) {
      reconnect(error);
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
