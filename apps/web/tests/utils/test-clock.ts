/**
 * Test connections put `test_clock` ahead of `pg_catalog` on the search path (vitest.config.mts),
 * so an unqualified `now()`, in app code and in tests, resolves to `test_clock.now()`. That
 * function returns `frozen_at` when set, otherwise the real `pg_catalog.now()` plus `shift`.
 * Column defaults are bound to `pg_catalog.now()` when the table is created, so they always use
 * the real clock.
 */
export const TEST_CLOCK_SETUP_SQL = `
  CREATE SCHEMA IF NOT EXISTS test_clock;
  CREATE TABLE IF NOT EXISTS test_clock.state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    shift interval NOT NULL DEFAULT '0',
    frozen_at timestamptz
  );
  INSERT INTO test_clock.state DEFAULT VALUES ON CONFLICT (id) DO NOTHING;
  UPDATE test_clock.state SET shift = '0', frozen_at = NULL;
  CREATE OR REPLACE FUNCTION test_clock.now() RETURNS timestamptz
    LANGUAGE sql STABLE
    AS $$ SELECT coalesce((SELECT coalesce(frozen_at, pg_catalog.now() + shift) FROM test_clock.state), pg_catalog.now()) $$;
`;
