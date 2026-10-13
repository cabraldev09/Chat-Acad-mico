/* eslint-disable */
// Rebuilds ../supabase/schema.sql from the migrations: creates a throw-away database, migrates it,
// dumps the structure and appends the migration list and the Row Level Security block.
// Run after adding a migration: node scripts/build-schema.js   (needs `npm run build` first)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PGBIN = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const PGUSER = process.env.PGUSER || require("os").userInfo().username;
const DB = "whaticket_schema_build";
const OUT = path.resolve(ROOT, "../supabase/schema.sql");
const pg = (bin, args) => execFileSync(`${PGBIN}/${bin}`, args, { maxBuffer: 64 * 1024 * 1024 }).toString();
const psql = (db, q) => pg("psql", ["-X", "-U", PGUSER, "-d", db, "-At", "-c", q]).trim();

const previous = fs.readFileSync(OUT, "utf8");
const rls = previous.slice(previous.indexOf("-- Row Level Security:"));

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${DB}`);
  psql("postgres", `CREATE DATABASE ${DB}`);
  const env = { ...process.env, DB_NAME: DB, DB_HOST: "localhost", DB_USER: PGUSER, DB_PASS: "", DB_PORT: "5432", DB_DIALECT: "postgres" };
  execFileSync("npx", ["sequelize", "db:migrate"], { cwd: ROOT, env, stdio: "ignore" });
  const dump = pg("pg_dump", ["-U", PGUSER, "-d", DB, "--schema-only", "--no-owner", "--no-privileges"]);
  const names = psql(DB, 'SELECT name FROM "SequelizeMeta" ORDER BY name').split("\n").filter(Boolean);
  const header = previous.split("--\n-- PostgreSQL database dump")[0];
  const body = dump.replace(/^\\(un)?restrict.*\n/gm, "");
  const out =
    header +
    "--\n-- PostgreSQL database dump" +
    body.split("-- PostgreSQL database dump").slice(1).join("-- PostgreSQL database dump") +
    "\n-- Migrations já aplicadas (assim o `npm run db:migrate` não tenta criar de novo)\nSET search_path TO public;\n" +
    names.map((n) => `INSERT INTO "SequelizeMeta" (name) VALUES ('${n}') ON CONFLICT DO NOTHING;`).join("\n") +
    "\n\n" +
    rls;
  fs.writeFileSync(OUT, out);
  console.log(`schema.sql atualizado: ${names.length} migrations, ${(out.match(/CREATE TABLE/g) || []).length} tabelas`);
} finally {
  try { psql("postgres", `DROP DATABASE IF EXISTS ${DB}`); } catch (e) {}
}
