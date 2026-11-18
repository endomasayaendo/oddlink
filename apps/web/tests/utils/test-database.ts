// Tests truncate tables, so they may only touch a database whose name marks it as disposable:
// `<name>_test` or `<name>_test_<suffix>` (for example `oddlink_test` or `oddlink_test_97`).
const TEST_DATABASE_NAME = /_test(?:_[A-Za-z0-9-]+)?$/;

export function isTestDatabaseName(name: string): boolean {
  return TEST_DATABASE_NAME.test(name);
}

/**
 * Throws unless `name` is a test database name. The message names only the database, never the
 * connection string, which may hold a password.
 */
export function assertTestDatabaseName(name: string): void {
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end in "_test" or "_test_<suffix>", because the tests truncate its tables.`,
    );
  }
}

/**
 * Returns the database name from a postgres:// or postgresql:// URL, percent-decoded, after checking
 * that it is a test database. Error messages never include the URL itself.
 */
export function testDatabaseNameFromUrl(value: string | undefined, variable = "TEST_DATABASE_URL"): string {
  if (!value) throw new Error(`${variable} is not set.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} is not a valid URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variable} must start with postgres:// or postgresql://.`);
  }

  let name: string;
  try {
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(`${variable} has a malformed database name.`);
  }
  if (!name) throw new Error(`${variable} does not name a database.`);

  assertTestDatabaseName(name);
  return name;
}
