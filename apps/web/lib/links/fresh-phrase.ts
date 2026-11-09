import { generatePhrase } from "@oddlink/utils";
import { SHORT_CODE_MAX_LENGTH } from "@/lib/db/schema";
import { getWords } from "./get-words";

const MAX_ATTEMPTS = 5;

/** Returned by a `write` callback to have the phrase treated as taken and a new one generated. */
export const COLLISION = Symbol("collision");

export type GeneratePhrase = () => Promise<string>;

export const defaultGenerate: GeneratePhrase = async () => generatePhrase(await getWords());

type Options = {
  generate?: GeneratePhrase;
  /** Used in log lines, e.g. "issue a short code". */
  label: string;
};

/**
 * Calls `write` with freshly generated phrases until it succeeds, regenerating on unique
 * violations (23505), on COLLISION, and on phrases too long for the short_code column. All three
 * share MAX_ATTEMPTS. Returns null (log written) when attempts run out or anything else fails.
 */
export async function withFreshPhrase<T>(
  write: (shortCode: string) => Promise<T | typeof COLLISION>,
  { generate = defaultGenerate, label }: Options,
): Promise<{ value: T } | null> {
  let tooLong = 0;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const shortCode = await generate();
      // Would fail with 22001 (value too long). Count code points, as varchar(n) does.
      const length = [...shortCode].length;
      if (length > SHORT_CODE_MAX_LENGTH) {
        tooLong++;
        console.warn(`Generated phrase is ${length} characters (max ${SHORT_CODE_MAX_LENGTH}); check the word lists for long words`);
        continue;
      }
      try {
        const value = await write(shortCode);
        if (value !== COLLISION) return { value };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    console.warn(
      `Failed to ${label} after ${MAX_ATTEMPTS} attempts (${MAX_ATTEMPTS - tooLong} collisions, ${tooLong} too long)`,
    );
  } catch (error) {
    console.error(`Failed to ${label}`, error);
  }
  return null;
}

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}
