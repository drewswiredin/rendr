import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/rendr.db";

if (url.startsWith("file:")) {
  mkdirSync("./data", { recursive: true });
}

const db = drizzle(createClient({ url }));
migrate(db, { migrationsFolder: "./lib/db/migrations" }).then(() => {
  console.log("migrations applied");
});
