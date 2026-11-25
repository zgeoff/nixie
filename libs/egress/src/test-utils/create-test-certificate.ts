import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestCertificate {
  readonly cert: string;
  readonly key: string;
}

export async function createTestCertificate(names: readonly string[]): Promise<TestCertificate> {
  const directory = await mkdtemp(join(tmpdir(), 'fetch-cert-'));

  try {
    const result = Bun.spawnSync([
      'openssl',
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '1',
      '-subj',
      `/CN=${names[0] ?? 'test'}`,
      '-addext',
      `subjectAltName=${names.map((name) => `DNS:${name}`).join(',')}`,
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`openssl failed: ${result.stderr.toString()}`);
    }

    return {
      cert: await readFile(join(directory, 'cert.pem'), 'utf8'),
      key: await readFile(join(directory, 'key.pem'), 'utf8'),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
