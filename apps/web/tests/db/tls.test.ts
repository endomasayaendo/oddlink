import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket } from "node:tls";
import { Client, type Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, sslOptions } from "@/lib/db";
import { parseEnv } from "@/lib/env";
import { createTlsFixtures, type TlsFixtures } from "./tls-fixtures";

// A stand-in for Postgres that speaks just enough of the protocol to prove what the client did:
// it answers an SSLRequest with "S", upgrades to TLS with the given certificate, and then rejects
// the startup message with an ErrorResponse whose text says whether that message arrived over TLS.
const SSL_REQUEST_CODE = 80877103;

type Seen = { sslRequested: boolean; startupOverTls: boolean | undefined };

function errorResponse(message: string): Buffer {
  const fields = Buffer.concat([
    Buffer.from("SFATAL\0"),
    Buffer.from("C28000\0"),
    Buffer.from(`M${message}\0`),
    Buffer.from([0]),
  ]);
  const header = Buffer.alloc(5);
  header.write("E", 0);
  header.writeInt32BE(fields.length + 4, 1);
  return Buffer.concat([header, fields]);
}

function startFakePostgres(cert: { cert: string; key: string }) {
  const seen: Seen[] = [];
  const server: Server = createServer((socket: Socket) => {
    const entry: Seen = { sslRequested: false, startupOverTls: undefined };
    seen.push(entry);
    socket.on("error", () => {});
    socket.once("data", (first: Buffer) => {
      if (first.length >= 8 && first.readInt32BE(4) === SSL_REQUEST_CODE) {
        entry.sslRequested = true;
        socket.write("S");
        const tls = new TLSSocket(socket, { isServer: true, cert: cert.cert, key: cert.key });
        tls.on("error", () => {});
        tls.once("data", () => {
          entry.startupOverTls = true;
          tls.end(errorResponse("fake-postgres: startup received over TLS"));
        });
      } else {
        entry.startupOverTls = false;
        socket.end(errorResponse("fake-postgres: startup received in plaintext"));
      }
    });
  });
  return new Promise<{ server: Server; port: number; seen: Seen[] }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0, seen });
    });
  });
}

let fixtures: TlsFixtures;
const servers: Server[] = [];
const pools: Pool[] = [];

beforeAll(() => {
  fixtures = createTlsFixtures();
});

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
});

async function serve(cert: { cert: string; key: string }) {
  const fake = await startFakePostgres(cert);
  servers.push(fake.server);
  return fake;
}

function poolFor(host: string, port: number, ca: string | undefined) {
  const env = parseEnv(
    { DATABASE_URL: `postgres://app:pw@${host}:${port}/oddlink`, DATABASE_CA_CERT: ca },
    "lenient",
  );
  const pool = createPool(env);
  pools.push(pool);
  return pool;
}

describe("database TLS", () => {
  it("verifies the server against DATABASE_CA_CERT and completes the handshake", async () => {
    const fake = await serve(fixtures.localhost);
    const pool = poolFor("localhost", fake.port, fixtures.caPem);

    await expect(pool.query("SELECT 1")).rejects.toThrow("startup received over TLS");
    expect(fake.seen).toEqual([{ sslRequested: true, startupOverTls: true }]);
  });

  it("accepts the CA as base64", async () => {
    const fake = await serve(fixtures.localhost);
    const pool = poolFor("localhost", fake.port, Buffer.from(fixtures.caPem).toString("base64"));

    await expect(pool.query("SELECT 1")).rejects.toThrow("startup received over TLS");
  });

  it("refuses a server certificate from another CA", async () => {
    const fake = await serve(fixtures.localhost);
    const pool = poolFor("localhost", fake.port, fixtures.otherCaPem);

    const error = await pool.query("SELECT 1").then(
      () => undefined,
      (err: Error & { code?: string }) => err,
    );
    expect(error?.message).not.toContain("fake-postgres");
    expect(error?.code).toMatch(/SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/);
    expect(fake.seen[0]?.startupOverTls).toBeUndefined();
  });

  it("refuses a certificate whose name does not match the host", async () => {
    const fake = await serve(fixtures.wrongName);
    const pool = poolFor("localhost", fake.port, fixtures.caPem);

    const error = await pool.query("SELECT 1").then(
      () => undefined,
      (err: Error & { code?: string }) => err,
    );
    expect(error?.code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
    expect(fake.seen[0]?.startupOverTls).toBeUndefined();
  });

  it("connects without TLS when no CA is set, even if PGSSLMODE asks for it", async () => {
    const fake = await serve(fixtures.localhost);
    const previous = process.env.PGSSLMODE;
    process.env.PGSSLMODE = "require";
    try {
      const pool = poolFor("127.0.0.1", fake.port, undefined);
      await expect(pool.query("SELECT 1")).rejects.toThrow("startup received in plaintext");
    } finally {
      if (previous === undefined) delete process.env.PGSSLMODE;
      else process.env.PGSSLMODE = previous;
    }
    expect(fake.seen).toEqual([{ sslRequested: false, startupOverTls: false }]);
  });
});

describe("sslOptions", () => {
  it("requires verification when a CA is set and disables TLS otherwise", () => {
    expect(sslOptions({ DATABASE_CA_CERT: "PEM" })).toEqual({ ca: "PEM", rejectUnauthorized: true });
    expect(sslOptions({ DATABASE_CA_CERT: undefined })).toBe(false);
  });
});

// Why lib/env.ts rejects TLS query parameters: pg parses the connection string and assigns the
// result over the other options, so the URL wins over the `ssl` option built from the CA.
describe("node-postgres precedence of connection string TLS parameters", () => {
  const ssl = { ca: "PEM", rejectUnauthorized: true };
  const sslOf = (query: string) =>
    (new Client({ connectionString: `postgres://u:p@db.example.com/x?${query}`, ssl }) as unknown as {
      connectionParameters: { ssl: unknown };
    }).connectionParameters.ssl;

  it("drops the CA for sslmode=verify-full", () => {
    expect(sslOf("sslmode=verify-full")).toEqual({});
  });

  it("turns TLS off for sslmode=disable and verification off for sslmode=no-verify", () => {
    expect(sslOf("sslmode=disable")).toBe(false);
    expect(sslOf("sslmode=no-verify")).toEqual({ rejectUnauthorized: false });
  });

  it("keeps the option when the URL has no TLS parameters", () => {
    expect(sslOf("application_name=x")).toEqual(ssl);
  });
});
