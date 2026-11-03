import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runOverflowForkProbe } from './run-overflow-fork-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-overflow-fork-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it drops a failed overflow turn from a fork at the last committed boundary', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK', inputTokens: 14_100 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 1 } }, inputTokens: 14_150 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 2 } }, inputTokens: 18_200 },
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 3 } }, inputTokens: 22_300 },
    { text: 'OK', inputTokens: 14_200 },
  );

  const run = await runOverflowForkProbe(ctx.target);

  const forkResult = run.fork.messages.at(-1);
  const forkRequest = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  expect(run.seed.messages.at(-1)).toMatchObject({
    type: 'result',
    terminal_reason: 'blocking_limit',
  });

  expect(JSON.stringify(run.original)).toInclude('Prompt is too long');
  expect(JSON.stringify(run.original)).toInclude('"type":"tool_use"');
  expect(forkResult).toMatchObject({ type: 'result', subtype: 'success', is_error: false });
  expect(forkResult?.session_id).not.toBe(run.sessionID);
  expect(JSON.stringify(run.forked)).not.toInclude('Prompt is too long');
  expect(JSON.stringify(run.forked)).not.toInclude('"type":"tool_use"');
  expect(forkRequest).not.toInclude('read_page');
});
