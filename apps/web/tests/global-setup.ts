import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { TEST_CLOCK_SETUP_SQL } from "./utils/test-clock";
import { assertTestDatabaseName, testDatabaseNameFromUrl } from "./utils/test-database";

// Vitest can fail to print an error thrown from global setup, so the message is also written here.
// The guard's messages never contain the connection string.
function reportRefusal<T>(check: () => T): T {
  try {
    return check();
  } catch (err) {
    console.error(`\n${(err as Error).message}\n`);
    throw err;
  }
}

// Refuses a non-test database, creates the test database if needed, applies migrations and resets
// the test clock once per run.
export default async function setup() {
  const connectionString = process.env.TEST_DATABASE_URL;
  const dbName = reportRefusal(() => testDatabaseNameFromUrl(connectionString));

  const adminUrl = new URL(connectionString!);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>("SELECT current_database() AS name");
    reportRefusal(() => assertTestDatabaseName(rows[0].name));
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await client.query(TEST_CLOCK_SETUP_SQL);
  } finally {
    await client.end();
  }
}
