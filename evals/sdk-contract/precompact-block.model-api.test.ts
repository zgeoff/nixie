import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runPrecompactProbe } from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-precompact-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it compacts a session past the auto-compact window when no hook blocks it',
  async () => {
    const ctx = await setupTest();
    const probe = await runPrecompactProbe(ctx.target, 'unblocked');

    expect(probe.run.messages).toPartiallyContain({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: expect.toContainEntry(['trigger', 'auto']),
    });

    expect(probe.postCompacts).toHaveLength(1);
  },
  46_000,
);

test.skipIf(!isContractRun)(
  'it keeps a session whole when a PreCompact hook blocks its automatic compaction',
  async () => {
    const ctx = await setupTest();
    const probe = await runPrecompactProbe(ctx.target, 'blocked');

    const result = probe.run.messages.at(-1);

    invariant(result?.type === 'result');

    expect(probe.preCompacts).toMatchObject([{ trigger: 'auto' }]);
    expect(probe.postCompacts).toStrictEqual([]);

    expect(probe.run.messages).not.toPartiallyContain({
      type: 'system',
      subtype: 'compact_boundary',
    });

    expect(probe.transcript).not.toPartiallyContain({ subtype: 'compact_boundary' });
    expect(result).toMatchObject({ subtype: 'success', is_error: false });

    expect(
      result.usage.input_tokens +
        result.usage.cache_read_input_tokens +
        result.usage.cache_creation_input_tokens,
    ).toBeGreaterThan(20_000);
  },
  37_000,
);
