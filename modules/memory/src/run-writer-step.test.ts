import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { claimTask, tasksProjections } from '@heynixie/tasks';
import { buildTestClock, makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createWriterStaging } from './create-writer-staging';
import { startMemoryWriter } from './start-memory-writer';
import { startTestMemory } from './test-utils/start-test-memory';
import { writerConfigSchema } from './writer-config-schema';

// A writer over a test memory whose model call waits at a gate and then fails, and a step runner
// that starts the writer, claims its task and runs one step once the test has written its messages.
async function setupTest() {
  const memory = await startTestMemory();
  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };
  const clock = buildTestClock(1_000_000);
  const context = { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };
  const session = makeGatedCall(() => Promise.reject(new Error('the provider refused the call')));
  const writer = {
    context,
    store: memory.store,
    publish: memory.store.writeBatch,
    staging: createWriterStaging(),
    model: { model: 'claude-test-1', profile: 'writer-direct', runSession: session.call },
    gate: { check: () => Promise.reject(new Error('no write reaches the gate')) },
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    onError: () => {},
  };

  return {
    log,
    clock,
    session,
    runStep: async () => {
      const started = await startMemoryWriter(writer);

      memory.defer(() => started.stop());

      const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 3_600_000 });

      invariant(claim);
      return started.runStep({
        taskID: claim.lease.workID,
        stepKey: claim.stepKey,
        lease: claim.lease,
        inbox: [],
        sessionBoundary: null,
        signal: new AbortController().signal,
      });
    },
  };
}

test('it counts the backoff from the failure, not from the start of a slow batch', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  const step = ctx.runStep();

  await ctx.session.started;
  ctx.clock.advance(600_000);
  ctx.session.release();

  const result = await step;

  expect(result.timers).toStrictEqual([{ dueAt: 1_630_000 }]);
});
