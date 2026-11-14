import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logProjections, startWriter, writeRecords } from '@heynixie/log';
import { readTestSessionDeliveries } from './read-test-session-deliveries';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-deliveries-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const raw = crypto.getRandomValues(new Uint8Array(32));

  const deploymentKey = await crypto.subtle.importKey('raw', raw, 'AES-KW', false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { dataDir, deploymentKey, keyBase64: Buffer.from(raw).toString('base64') };
}

test('it lists the versions of a recall that a turn end covers', async () => {
  const ctx = await setupTest();
  const writer = await startWriter({ dataDir: ctx.dataDir });

  onTestFinished(() => writer.stop());

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords({ writer, deploymentKey: ctx.deploymentKey, projections: logProjections }, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:1', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 2 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [] },
    },
  ]);

  await writer.stop();

  const delivered = await readTestSessionDeliveries(ctx.dataDir, ctx.keyBase64, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-1', version: 2 }]);
});
