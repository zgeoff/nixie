import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runPrecompactProbe } from './run-precompact-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-precompact-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it compacts a session past the auto-compact window when no hook blocks it', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK', inputTokens: 12_100 },
    { text: 'OK', inputTokens: 24_200 },
    { text: '<summary>The owner shared 2 parts of tide notes.</summary>' },
    { text: '2' },
  );

  const probe = await runPrecompactProbe(ctx.target, 'unblocked');

  const asked = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  expect(probe.run.messages).toPartiallyContain({
    type: 'system',
    subtype: 'compact_boundary',
    compact_metadata: expect.toContainEntry(['trigger', 'auto']),
  });

  expect(probe.postCompacts).toHaveLength(1);

  expect([asked.includes('part 1 line'), asked.includes('2 parts of tide notes')]).toStrictEqual([
    false,
    true,
  ]);
});

test('it keeps a session whole when a PreCompact hook blocks its automatic compaction', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK', inputTokens: 12_100 },
    { text: 'OK', inputTokens: 24_200 },
    { text: '2', inputTokens: 24_300 },
  );

  const probe = await runPrecompactProbe(ctx.target, 'blocked');

  const result = probe.run.messages.at(-1);
  const asked = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  expect(probe.preCompacts).toMatchObject([{ trigger: 'auto' }]);
  expect(probe.postCompacts).toStrictEqual([]);

  expect(probe.run.messages).not.toPartiallyContain({
    type: 'system',
    subtype: 'compact_boundary',
  });

  expect(probe.transcript).not.toPartiallyContain({ subtype: 'compact_boundary' });
  expect(result).toMatchObject({ type: 'result', subtype: 'success', is_error: false });

  expect([asked.includes('part 1 line'), asked.includes('part 2 line')]).toStrictEqual([
    true,
    true,
  ]);

  expect(ctx.model.requests).toHaveLength(3);
});
