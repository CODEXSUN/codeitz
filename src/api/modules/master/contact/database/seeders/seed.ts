import type { Kysely } from "kysely";
import { randomInt } from "node:crypto";
import type { Database } from "../types.ts";
export async function seed(_db: Kysely<Database>) {
  return "Contacts: no-data policy; no sample contacts created.";
}
