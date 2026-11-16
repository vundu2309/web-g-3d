import { createApi } from "./app.mjs";

const server = createApi({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_PUBLISHABLE_KEY,
  origins: process.env.ALLOWED_ORIGINS?.split(",")
    .map((x) => x.trim())
    .filter(Boolean),
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 10000), "0.0.0.0");
process.on("SIGTERM", () => {
  server.io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25000).unref();
});
