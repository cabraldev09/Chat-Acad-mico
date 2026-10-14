require("../bootstrap");

// Works with MariaDB/MySQL (local) and PostgreSQL (Supabase).
//   DB_DIALECT=mysql|postgres
//   DATABASE_URL=postgresql://user:pass@host:5432/db   (optional, wins over DB_*)
//   DB_SSL=true                                        (Supabase needs SSL)
// Every timestamp is stored in UTC; the company timezone (APP_TIMEZONE /
// Setting "appTimezone") is applied only when dates are shown or day-bounded.
const fromUrl = (): Record<string, any> => {
  if (!process.env.DATABASE_URL) return {};
  const u = new URL(process.env.DATABASE_URL);
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
  ...fromUrl(),
  dialectOptions: useSsl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  // Supabase's session pooler allows only ~15 simultaneous connections per project, and a deploy briefly
  // runs two copies of the API: keep the pool small there
  pool: {
    max: Number(process.env.DB_POOL_MAX || (/pooler\.supabase\.com/.test(process.env.DATABASE_URL || "") ? 4 : 10)),
    idle: 10000
  },
  logging: false
};
