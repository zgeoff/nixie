import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { tasksProjections } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { consolidationConfigSchema } from './consolidation-config-schema';
import { createConsolidationStaging } from './create-consolidation-staging';
import { startMemoryConsolidator } from './start-memory-consolidator';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };

  const parts = {
    context: { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    store: memory.store,
    staging: createConsolidationStaging(),
    model: {
      model: 'claude-test-1',
      profile: 'consolidator-direct',
      runSession: () => Promise.reject(new Error('no session runs at start')),
    },
    config: consolidationConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: null,
    onError: () => {},
  };

  return { log, parts };
}

test('it creates its system task once and wakes it on every start', async () => {
  const ctx = await setupTest();

  await startMemoryConsolidator(ctx.parts);
  await startMemoryConsolidator(ctx.parts);

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((entry) => [entry.record.kind, entry.record.thread])).toStrictEqual([
    ['task.created', 'memory-consolidator'],
    ['task.wake', 'memory-consolidator'],
    ['task.wake', 'memory-consolidator'],
  ]);
});
