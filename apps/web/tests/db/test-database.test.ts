import { describe, expect, it } from "vitest";
import { assertConnectedToTestDatabase } from "../utils/reset-db";
import { isTestDatabaseName, testDatabaseNameFromUrl } from "../utils/test-database";

describe("isTestDatabaseName", () => {
  it.each(["oddlink_test", "oddlink_test_97", "oddlink_test_feat-x", "other_test", "a_test_B2"])(
    "accepts %s",
    (name) => {
      expect(isTestDatabaseName(name)).toBe(true);
    },
  );

  it.each(["oddlink", "postgres", "oddlink_testing", "oddlink_test_", "test", "oddlinktest", "oddlink_test_9/x", "oddlink_test_a_b"])(
    "rejects %s",
    (name) => {
      expect(isTestDatabaseName(name)).toBe(false);
    },
  );
});

describe("testDatabaseNameFromUrl", () => {
  it.each([
    ["postgres://postgres:postgres@localhost:5432/oddlink_test", "oddlink_test"],
    ["postgresql://postgres:postgres@localhost:5432/oddlink_test_97", "oddlink_test_97"],
    ["postgres://localhost/oddlink_test?sslmode=disable&application_name=x", "oddlink_test"],
    ["postgres://u:p@localhost/oddlink_test#frag", "oddlink_test"],
    ["postgres://u:p@localhost/my%20db_test", "my db_test"],
    ["postgres://u:p@localhost/oddlink%5Ftest", "oddlink_test"],
    ["postgres://u:p@[::1]:5432/oddlink_test_1", "oddlink_test_1"],
  ])("returns the decoded name from %s", (url, name) => {
    expect(testDatabaseNameFromUrl(url)).toBe(name);
  });

  it("rejects a non-test database and names only the database", () => {
    const url = "postgres://admin:s3cr3t-pa55@db.example.com:5432/oddlink?sslmode=require";
    let message = "";
    try {
      testDatabaseNameFromUrl(url);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('"oddlink"');
    expect(message).not.toContain("s3cr3t-pa55");
    expect(message).not.toContain("admin");
    expect(message).not.toContain("db.example.com");
  });

  it("is not fooled by a test-like name in the query string or fragment", () => {
    expect(() => testDatabaseNameFromUrl("postgres://u:p@localhost/oddlink?db=oddlink_test")).toThrow('"oddlink"');
    expect(() => testDatabaseNameFromUrl("postgres://u:p@localhost/oddlink#_test")).toThrow('"oddlink"');
  });

  it.each([
    [undefined, "is not set"],
    ["", "is not set"],
    ["not a url s3cr3t", "is not a valid URL"],
    ["mysql://u:s3cr3t@localhost/oddlink_test", "must start with postgres:// or postgresql://"],
    ["postgres://u:s3cr3t@localhost", "does not name a database"],
    ["postgres://u:s3cr3t@localhost/", "does not name a database"],
    ["postgres://u:s3cr3t@localhost/bad%E0_test", "malformed database name"],
  ])("rejects %s without echoing it", (url, expected) => {
    expect(() => testDatabaseNameFromUrl(url)).toThrow(expected);
    try {
      testDatabaseNameFromUrl(url);
    } catch (err) {
      expect((err as Error).message).not.toContain("s3cr3t");
    }
  });
});

describe("test database wiring", () => {
  it("connects the app's db client to the database named by TEST_DATABASE_URL", async () => {
    // Same database; the app's URL may carry extra connection options (the test clock's search_path).
    const pathOf = (value: string | undefined) => new URL(value!).pathname;
    expect(pathOf(process.env.DATABASE_URL)).toBe(pathOf(process.env.TEST_DATABASE_URL));
    await expect(assertConnectedToTestDatabase()).resolves.toBeUndefined();
  });
});
