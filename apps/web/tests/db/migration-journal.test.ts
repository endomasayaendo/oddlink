import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The drizzle migrator applies a migration only when its `when` is newer than the newest one
// already recorded in the database, so an entry whose `when` is not after the previous entry's is
// skipped without an error on any database that already has the previous one.

type JournalEntry = { idx: number; when: number; tag: string };

const drizzleDir = new URL("../../drizzle/", import.meta.url);

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", drizzleDir), "utf8"));
  return journal.entries;
}

/** Problems that would make the migrator skip or misorder entries; empty when the journal is sound. */
function orderingProblems(entries: JournalEntry[]): string[] {
  const problems: string[] = [];
  entries.forEach((entry, position) => {
    if (entry.idx !== position) problems.push(`${entry.tag}: idx is ${entry.idx}, expected ${position}`);
    if (!Number.isInteger(entry.when)) problems.push(`${entry.tag}: when is not an integer`);
    const previous = entries[position - 1];
    if (previous && !(entry.when > previous.when)) {
      problems.push(`${entry.tag}: when ${entry.when} is not after ${previous.tag} (${previous.when})`);
    }
  });
  return problems;
}

describe("drizzle migration journal", () => {
  it("has strictly increasing idx and when", () => {
    expect(orderingProblems(readJournal())).toEqual([]);
  });

  it("lists exactly the SQL files in the migrations folder", () => {
    const files = readdirSync(drizzleDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, -".sql".length))
      .sort();
    expect(readJournal().map((entry) => entry.tag).sort()).toEqual(files);
  });

  it("flags an entry whose when is older than the previous entry's", () => {
    const entries: JournalEntry[] = [
      { idx: 0, when: 200, tag: "0000_a" },
      { idx: 1, when: 100, tag: "0001_b" },
    ];
    expect(orderingProblems(entries)).toEqual(["0001_b: when 100 is not after 0000_a (200)"]);
  });

  it("flags an entry whose idx does not match its position", () => {
    const entries: JournalEntry[] = [
      { idx: 0, when: 100, tag: "0000_a" },
      { idx: 2, when: 200, tag: "0002_b" },
    ];
    expect(orderingProblems(entries)).toEqual(["0002_b: idx is 2, expected 1"]);
  });
});
