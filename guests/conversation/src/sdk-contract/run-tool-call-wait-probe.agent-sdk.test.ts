import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { collectToolCalls } from './collect-tool-calls';
import {
  runToolCallWaitProbe,
  toolCallWaitProbeText,
  toolCallWaitProbeToolName,
} from './run-tool-call-wait-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-tool-call-wait-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  model.addReplies({ toolUse: { name: toolCallWaitProbeToolName, input: {} } }, { text: 'DONE' });

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it gives the result of a tool that returns after 1 second under a wait of 2 seconds', async () => {
  const ctx = await setupTest();
  const run = await runToolCallWaitProbe(ctx.target, 1000);

  const result = collectToolCalls(run.messages).at(0)?.result;
  const sent = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  invariant(result);

  expect(result).toStrictEqual({ isError: false, text: toolCallWaitProbeText });
  expect(sent).toInclude(toolCallWaitProbeText);
});

test('it gives no result for a tool that returns after 3 seconds under a wait of 2 seconds', async () => {
  const ctx = await setupTest();
  const run = await runToolCallWaitProbe(ctx.target, 3000);

  const result = collectToolCalls(run.messages).at(0)?.result;
  const sent = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  invariant(result);

  expect(result.text).not.toInclude(toolCallWaitProbeText);
  expect(sent).not.toInclude(toolCallWaitProbeText);
  expect(result.isError).toBe(true);
  expect(result.text).toInclude('timed out after 2s');
});
