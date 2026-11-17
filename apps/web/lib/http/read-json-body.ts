export type ReadJsonBodyResult = { ok: true; body: unknown } | { ok: false; reason: "too_large" };

/**
 * Parses a request body as JSON without buffering more than `maxBytes`.
 *
 * A declared `Content-Length` above the limit is rejected before any byte is read. Otherwise the
 * stream is read chunk by chunk and cancelled as soon as the running total passes the limit, which
 * also covers chunked bodies and a `Content-Length` that understates the real size. A body that is
 * empty or not valid JSON yields `body: null`.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<ReadJsonBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, body: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: true, body: null };
  }
}
