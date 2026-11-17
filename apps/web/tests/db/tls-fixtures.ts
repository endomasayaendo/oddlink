import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TlsFixtures = {
  /** PEM of the CA that signed both server certificates. */
  caPem: string;
  /** PEM of an unrelated CA. */
  otherCaPem: string;
  /** Server certificate and key valid for the name `localhost`. */
  localhost: { cert: string; key: string };
  /** Server certificate and key valid only for `db.invalid`. */
  wrongName: { cert: string; key: string };
};

function openssl(dir: string, args: string[]) {
  execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
}

function makeCa(dir: string, name: string) {
  writeFileSync(
    join(dir, `${name}.cnf`),
    [
      "[req]",
      "distinguished_name = dn",
      "x509_extensions = ext",
      "prompt = no",
      "[dn]",
      `CN = ${name}`,
      "[ext]",
      "basicConstraints = critical, CA:TRUE",
      "keyUsage = critical, keyCertSign, cRLSign",
      "subjectKeyIdentifier = hash",
    ].join("\n"),
  );
  openssl(dir, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-keyout", `${name}.key`, "-out", `${name}.pem`, "-config", `${name}.cnf`,
  ]);
}

function makeServer(dir: string, name: string, dnsName: string) {
  writeFileSync(
    join(dir, `${name}.ext`),
    [
      "basicConstraints = CA:FALSE",
      "keyUsage = critical, digitalSignature, keyEncipherment",
      "extendedKeyUsage = serverAuth",
      `subjectAltName = DNS:${dnsName}`,
    ].join("\n"),
  );
  openssl(dir, [
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", `/CN=${dnsName}`,
    "-keyout", `${name}.key`, "-out", `${name}.csr`,
  ]);
  openssl(dir, [
    "x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial",
    "-days", "2", "-extfile", `${name}.ext`, "-out", `${name}.pem`,
  ]);
  return {
    cert: readFileSync(join(dir, `${name}.pem`), "utf8"),
    key: readFileSync(join(dir, `${name}.key`), "utf8"),
  };
}

/** Generates throwaway certificates with the openssl CLI; nothing is written outside a temp dir. */
export function createTlsFixtures(): TlsFixtures {
  const dir = mkdtempSync(join(tmpdir(), "oddlink-tls-"));
  try {
    makeCa(dir, "ca");
    makeCa(dir, "other-ca");
    return {
      caPem: readFileSync(join(dir, "ca.pem"), "utf8"),
      otherCaPem: readFileSync(join(dir, "other-ca.pem"), "utf8"),
      localhost: makeServer(dir, "localhost", "localhost"),
      wrongName: makeServer(dir, "wrong-name", "db.invalid"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
