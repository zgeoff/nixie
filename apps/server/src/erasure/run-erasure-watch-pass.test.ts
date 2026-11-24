import { expect, mock, test } from 'bun:test';
import { makeErasureRunner, readOpenErasures } from '@heynixie/log';
import { buildTestErasable, buildTestErasureEffects, startTestLog } from '@heynixie/log/test-utils';
import type { Logger } from '@heynixie/logger';
import { runErasureWatchPass } from './run-erasure-watch-pass';

async function setupTest() {
  const testLog = await startTestLog();

  const fake = buildTestErasureEffects();
  const logged = mock<Logger>();

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

  return {
    ...testLog,
    ...fake,
    note,
    logged,
    runPass: (nowMs: number) =>
      runErasureWatchPass({ runner, log: logged, nowMs: () => nowMs, stuckAfterMs: 300_000 }),
  };
}

test('it raises an alert for an erasure that stays open past the threshold, and for a failed retry', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });

  ctx.crashAt('erasure.cleaned');

  await ctx.runPass(ctx.clock.now() + 300_000);

  expect(ctx.logged.mock.calls.map((call) => [call[0], call[2]])).toStrictEqual([
    ['erasure.retry_failed', 'warn'],
    ['erasure.stuck', 'error'],
  ]);
});

test('it raises no alert for an erasure that the retry finishes', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });
  await ctx.runPass(ctx.clock.now() + 300_000);

  expect(ctx.logged).not.toHaveBeenCalled();
});

test('it leaves a young erasure open and raises no alert for it', async () => {
  const ctx = await setupTest();

  await ctx.note.begin({ id: 'a' }, { by: 'user' });
  await ctx.runPass(ctx.clock.now() + 60_000);

  const records = await readOpenErasures(ctx.log);

  expect(ctx.logged).not.toHaveBeenCalled();
  expect(records).toHaveLength(1);
});
