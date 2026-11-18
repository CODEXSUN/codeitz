import type { Kysely } from "kysely";
import type { TaskDatabase } from "../types.ts";
export async function seed(_db: Kysely<TaskDatabase>) {
  return "Tasks and workflow children: no-data policy; no sample work created.";
}
