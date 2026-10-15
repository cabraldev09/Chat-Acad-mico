require("../bootstrap");

// Works with MariaDB/MySQL (local) and PostgreSQL (Supabase).
//   DB_DIALECT=mysql|postgres
//   DATABASE_URL=postgresql://user:pass@host:5432/db   (optional, wins over DB_*)
//   DB_SSL=true                                        (Supabase needs SSL)
// Every timestamp is stored in UTC; the company timezone (APP_TIMEZONE /
// Setting "appTimezone") is applied only when dates are shown or day-bounded.
const fromUrl = (raw = process.env.DATABASE_URL): Record<string, any> => {
  if (!raw) return {};
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    database: u.pathname.replace(/^\//, ""),
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password)
  };
};

const dialect =
  process.env.DB_DIALECT ||
  (process.env.DATABASE_URL && /^postgres/.test(process.env.DATABASE_URL)
    ? "postgres"
    : "mysql");

const useSsl = process.env.DB_SSL === "true";

module.exports = {
  define:
    dialect === "mysql"
      ? { charset: "utf8mb4", collate: "utf8mb4_bin" }
      : {},
  dialect,
  timezone: "+00:00",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  // DATABASE_URL_POOL (optional): the same database through Supabase's transaction pooler (port 6543) for the API's
  // requests. The leader lock and the migrations need a session connection, so they keep using DATABASE_URL (see `lock`).
  ...fromUrl(process.env.DATABASE_URL_POOL || process.env.DATABASE_URL),
  lock: fromUrl(process.env.DATABASE_URL),
  dialectOptions: useSsl
    // The connection is always encrypted. The certificate is verified only when its authority is provided (DB_SSL_CA) or
    // DB_SSL_STRICT=true: Supabase's pooler certificate is not in Node's default list and a strict check stops the API
    // from starting ("self-signed certificate in certificate chain").
    ? { ssl: { require: true, rejectUnauthorized: !!process.env.DB_SSL_CA || process.env.DB_SSL_STRICT === "true", ...(process.env.DB_SSL_CA ? { ca: require("fs").readFileSync(process.env.DB_SSL_CA, "utf8") } : {}) } }
    : {},
  // Supabase offers two poolers: "session" (port 5432) allows only ~15 connections for the whole project, and a deploy
  // briefly runs two copies of the API, so the pool stays small there. "Transaction" (port 6543) serves many clients
  // from few connections, so the pool can be larger and requests do not queue behind each other.
  pool: {
    max: Number(
      process.env.DB_POOL_MAX ||
        (/pooler\.supabase\.com/.test(process.env.DATABASE_URL_POOL || process.env.DATABASE_URL || "")
          ? /:6543\//.test(process.env.DATABASE_URL_POOL || process.env.DATABASE_URL || "") ? 12 : 4
          : 10)
    ),
    idle: 10000,
    acquire: 30000
  },
  // queries slower than SLOW_QUERY_MS (default 400) are written to the log with the time they took
  benchmark: true,
  logging: (sql: string, ms?: number) => {
    const limit = Number(process.env.SLOW_QUERY_MS || 400);
    if (typeof ms === "number" && ms >= limit) {
      // eslint-disable-next-line no-console
      console.warn(`[slow-query] ${Math.round(ms)}ms ${String(sql).replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
};
