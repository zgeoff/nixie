import { expect, test } from 'bun:test';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasable, buildTestErasureEffects, startTestLog } from '@heynixie/log/test-utils';
import { buildErasureStuckPort } from './build-erasure-stuck-port';

async function setupTest() {
  const testLog = await startTestLog();

  const fake = buildTestErasureEffects();

  const runner = makeErasureRunner({
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    effects: fake.effects,
  });

  const note = runner.register(
    buildTestErasable({
      kind: 'note',
      childKind: 'image',
      targets: [{ id: 'a', keyIDs: [], childIDs: [] }],
      events: [],
    }),
  );

  const port = buildErasureStuckPort(runner, {
    nowMs: () => testLog.clock.now() + 300_000,
    stuckAfterMs: 300_000,
  });

  return { ...testLog, ...fake, note, port };
}

test('#readStuck reads the short ID and age of each open forget, and never its own ID', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });

  const stuck = await ctx.port.readStuck();

  expect(stuck).toStrictEqual([{ kind: 'note', shortID: 'short-a', openForMs: 300_000 }]);
});

test('#retryStuck finishes a stuck forget and answers none still open', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });

  const stillOpen = await ctx.port.retryStuck();
  const stuck = await ctx.port.readStuck();

  expect({ stillOpen, stuck }).toStrictEqual({ stillOpen: [], stuck: [] });
});

test('#retryStuck answers a forget that fails again', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });

  ctx.crashAt('erasure.cleaned');

  const stillOpen = await ctx.port.retryStuck();

  expect(stillOpen).toStrictEqual([{ kind: 'note', shortID: 'short-a', openForMs: 300_000 }]);
});
