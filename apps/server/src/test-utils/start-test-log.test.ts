import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestLog } from './start-test-log';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-log-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it starts a log with the tasks, sandboxes and memory projections and a fresh key', async () => {
  const ctx = await setupTest();
  const log = await startTestLog(ctx.dataDir);

  onTestFinished(() => log.writer.stop());

  expect(log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
    'memory_items',
    'memory_versions',
    'memory_writer',
    'memory_proposals',
    'memory_proposal_merges',
    'memory_notice_entries',
    'memory_forgotten_evidence',
    'memory_consolidations',
    'memory_consolidation_changes',
  ]);

  expect(log.deploymentKey.algorithm).toMatchObject({ name: 'AES-KW', length: 256 });
});
