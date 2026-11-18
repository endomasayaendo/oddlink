import { Pool } from "pg";
import { afterAll, beforeEach, vi } from "vitest";

/**
 * With TEST_CLOCK_START set (an ISO 8601 instant, e.g. `2028-02-29T23:59:59.95Z`), every test starts
 * with both clocks at that instant and running forward from there: `Date` in JS and `now()` in the
 * database (through `test_clock.state.shift`). Pick an instant just before a boundary (a minute,
 * a day in APP_TIME_ZONE, a leap day) to check that tests don't depend on where they start.
 * Unset, this file does nothing.
 */
const start = process.env.TEST_CLOCK_START;

if (start) {
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) throw new Error("TEST_CLOCK_START must be an ISO 8601 date-time");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const pinClocks = async () => {
    vi.useFakeTimers({ now: startMs, toFake: ["Date"], shouldAdvanceTime: true, advanceTimeDelta: 1 });
    await pool.query("UPDATE test_clock.state SET shift = $1::timestamptz - pg_catalog.clock_timestamp()", [
      new Date(startMs).toISOString(),
    ]);
  };

  // Test files often compute dates at import time, so pin before they load as well as before each test.
  await pinClocks();
  beforeEach(pinClocks);
  afterAll(async () => {
    await pool.query("UPDATE test_clock.state SET shift = '0'");
    await pool.end();
  });
}
