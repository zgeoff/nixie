import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  collectToolCalls,
  loadSessionTranscript,
  runEndTurnProbe,
} from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// The probes call the model on the subscription, so only a contract run enables them.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-end-turn-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it ends the turn on a tool result with the end-turn key, with no further model call and no nudge row',
  async () => {
    const ctx = await setupTest();
    const run = await runEndTurnProbe(ctx.target);

    const result = run.messages.find((message) => message.type === 'result');

    invariant(result);

    const transcript = await loadSessionTranscript(ctx.directory, result.session_id);

    expect(run.thrown).toBeNull();
    expect(collectToolCalls(run.messages)).toHaveLength(1);
    expect(result).toMatchObject({ subtype: 'success', stop_reason: 'tool_use', num_turns: 2 });
    expect(run.messages.filter((message) => message.type === 'assistant')).toHaveLength(1);
    expect(JSON.stringify(transcript)).not.toInclude('no visible output');
  },
  30_000,
);
