import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Creates the test database if needed and applies migrations once per run.
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const dbName = url.pathname.slice(1);

  const admin = new Client({ connectionString: new URL("/postgres", url).toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
