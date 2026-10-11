import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter, writeRecords } from '@heynixie/log';
import { readTestRecords } from './read-test-records';

// a stopped writer's data directory and the deployment key its records were written under
async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-records-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const deploymentKey = await crypto.subtle.importKey('raw', raw, 'AES-KW', false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { dataDir, deploymentKey, keyBase64: Buffer.from(raw).toString('base64') };
}

test('it reads every record with its erasable fields decrypted', async () => {
  const ctx = await setupTest();
  const writer = await startWriter({ dataDir: ctx.dataDir });

  await writeRecords({ writer, deploymentKey: ctx.deploymentKey, projections: logProjections }, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      erasable: { text: 'Hi.' },
    },
  ]);
  await writer.stop();

  const records = await readTestRecords(ctx.dataDir, ctx.keyBase64);

  expect(records).toMatchObject([
    { kind: 'owner_message', erasable: { status: 'readable', fields: { text: 'Hi.' } } },
  ]);
});
