import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { loadSessionTranscript } from './load-session-transcript';
import { endTurnProbeToolName, runEndTurnProbe } from './run-end-turn-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-end-turn-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  model.addReplies(
    { toolUse: { name: endTurnProbeToolName, input: {} } },
    { text: 'a reply that nobody should read' },
  );

  return {
    model,
    directory,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it makes no further model call after a tool result that carries the end-turn key', async () => {
  const ctx = await setupTest();

  await runEndTurnProbe(ctx.target);

  expect(ctx.model.requests).toHaveLength(1);
});

test('it ends the turn as a success whose last stop reason is tool_use', async () => {
  const ctx = await setupTest();
  const run = await runEndTurnProbe(ctx.target);

  const result = run.messages.find((message) => message.type === 'result');

  invariant(result);

  expect(run.thrown).toBeNull();
  expect(result).toMatchObject({ subtype: 'success', stop_reason: 'tool_use' });
});

test('it writes no nudge for a missing reply into the session after the end-turn key', async () => {
  const ctx = await setupTest();
  const run = await runEndTurnProbe(ctx.target);

  const result = run.messages.find((message) => message.type === 'result');

  invariant(result);

  const transcript = await loadSessionTranscript(ctx.directory, result.session_id);

  expect(JSON.stringify(transcript)).not.toInclude('no visible output');
});
