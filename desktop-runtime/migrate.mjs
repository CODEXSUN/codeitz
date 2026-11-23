import fs from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import { migrations } from "./migrations.mjs";
const source = process.env.CODEITZ_DESKTOP_DATABASE;
if (!source)
  throw new Error("CODEITZ_DESKTOP_DATABASE private config path required");
const config = JSON.parse(
  fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""),
);
const pool = new pg.Pool(config);
const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
try {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const result = await migrator.migrateToLatest();
  if (result.error) throw result.error;
  console.log(
    JSON.stringify({
      migrations: result.results?.map((x) => ({
        name: x.migrationName,
        status: x.status,
      })),
    }),
  );
} finally {
  await db.destroy();
}
