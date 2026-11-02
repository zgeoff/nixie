import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toolOutputLimitTokens } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { collectToolCalls } from './collect-tool-calls';
import { runToolOutputProbe } from './run-tool-output-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-tool-output-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it saves a page result past 50,000 characters to a file under the CLI defaults', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 1 } } },
    { text: 'DONE' },
  );

  // The live probe puts the 54 KB page past the CLI's 25,000-token cap and the 20 KB page under
  // the guest's 12,000, so the model's tokenizer reads these log lines at about 2 characters a token.
  ctx.model.setCharactersPerToken(2);

  const probe = await runToolOutputProbe(ctx.target, 'past-default');

  const read = collectToolCalls(probe.run.messages).at(0)?.result;
  const sent = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  invariant(read);

  expect(probe.served.length).toBeGreaterThan(50_000);
  expect(read.text).toInclude('exceeds maximum allowed tokens. Output has been saved to');
  expect(read.text).not.toInclude('Log 0: the lamp burned');
  expect(sent).not.toInclude('Log 0: the lamp burned');
});

test('it passes a page at the default text limit to the model whole under the guest tool-output settings', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 1 } } },
    { text: 'DONE' },
  );

  ctx.model.setCharactersPerToken(2);

  const probe = await runToolOutputProbe(ctx.target, 'at-guest-limit');

  const read = collectToolCalls(probe.run.messages).at(0)?.result;
  const sent = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  invariant(read);

  expect(Buffer.byteLength(probe.served)).toBeWithin(19_000, 20_001);
  expect(read.text).toInclude('lighthouses.example/archive/log/239/entry');
  expect(read.text).not.toInclude('OUTPUT TRUNCATED');
  expect(read.text).not.toInclude('Output has been saved to');
  expect(read.text).not.toInclude('<persisted-output>');
  expect(sent).toInclude('lighthouses.example/archive/log/239/entry');
});

test('it cuts a result past the guest tool-output limit inline and never saves it to a file', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__pages__read_page', input: { page: 1 } } },
    { text: 'DONE' },
  );

  ctx.model.setCharactersPerToken(2);

  const probe = await runToolOutputProbe(ctx.target, 'past-guest-limit');

  const read = collectToolCalls(probe.run.messages).at(0)?.result;

  invariant(read);

  expect(probe.served.length).toBeGreaterThan(100_000);
  expect(read.text.length).toBeLessThan(50_000);
  expect(read.text).toInclude('Log 0: the lamp burned');
  expect(read.text).toInclude(`OUTPUT TRUNCATED - exceeded ${toolOutputLimitTokens} token limit`);
  expect(read.text).not.toInclude('Output has been saved to');
  expect(read.text).not.toInclude('<persisted-output>');
});

test('it passes the model the image of a result whose JSON rides in a text block beside it', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__pages__read_photo', input: { page: 1 } } },
    { text: 'DONE' },
  );

  const probe = await runToolOutputProbe(ctx.target, 'image');

  const parts = probe.run.messages.flatMap((message) =>
    message.type === 'user' && typeof message.message.content !== 'string'
      ? message.message.content.flatMap((block) =>
          block.type === 'tool_result' && Array.isArray(block.content) ? block.content : [],
        )
      : [],
  );

  const sent = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  expect(parts).toStrictEqual([
    { type: 'text', text: '{"eventID":"12","number":1}' },
    { type: 'image', source: expect.objectContaining({ media_type: 'image/png' }) },
    { type: 'text', text: expect.toStartWith('[Image: source: ') },
  ]);

  expect(sent).toInclude('"media_type":"image/png"');
});
