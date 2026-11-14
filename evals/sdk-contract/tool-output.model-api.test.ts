import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  collectToolCalls,
  runToolOutputProbe,
} from '@heynixie/conversation/sdk-contract';
import { recallPageLimitBytes, toolOutputLimitTokens } from '@heynixie/wire';
import invariant from 'tiny-invariant';

// The probes call the model on the subscription, so only a contract run enables them. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-tool-output-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it saves a page result past 50,000 characters to a file under the CLI defaults',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'past-default');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(probe.served.length).toBeGreaterThan(50_000);
    expect(read.text).toInclude('exceeds maximum allowed tokens. Output has been saved to');
    expect(read.text).not.toInclude('Log 0: the lamp burned');
  },
  27_000,
);

test.skipIf(!isContractRun)(
  'it passes a page at the default text limit to the model whole under the guest tool-output settings',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'at-guest-limit');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(Buffer.byteLength(probe.served)).toBeWithin(19_000, 20_001);
    expect(read.text).toInclude('lighthouses.example/archive/log/239/entry');
    expect(read.text).not.toInclude('OUTPUT TRUNCATED');
    expect(read.text).not.toInclude('Output has been saved to');
    expect(read.text).not.toInclude('<persisted-output>');
  },
  27_000,
);

test.skipIf(!isContractRun)(
  'it cuts a result past the guest tool-output limit inline and never saves it to a file',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'past-guest-limit');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(probe.served.length).toBeGreaterThan(100_000);
    expect(read.text.length).toBeLessThan(50_000);
    expect(read.text).toInclude('Log 0: the lamp burned');
    expect(read.text).toInclude(`OUTPUT TRUNCATED - exceeded ${toolOutputLimitTokens} token limit`);
    expect(read.text).not.toInclude('Output has been saved to');
    expect(read.text).not.toInclude('<persisted-output>');
  },
  34_000,
);

test.skipIf(!isContractRun)(
  'it passes the model the image of a result whose JSON rides in a text block beside it',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'image');

    const parts = probe.run.messages.flatMap((message) =>
      message.type === 'user' && typeof message.message.content !== 'string'
        ? message.message.content.flatMap((block) =>
            block.type === 'tool_result' && Array.isArray(block.content) ? block.content : [],
          )
        : [],
    );

    expect(parts).toStrictEqual([
      { type: 'text', text: '{"eventID":"12","number":1}' },
      { type: 'image', source: expect.objectContaining({ media_type: 'image/png' }) },
      { type: 'text', text: expect.toStartWith('[Image: source: ') },
    ]);
  },
  24_000,
);

test.skipIf(!isContractRun)(
  'it passes a filler of the page limit to the model whole',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'at-page-limit');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(Buffer.byteLength(probe.served)).toBe(recallPageLimitBytes);
    expect(read.text).toInclude('Log 199: ');
    expect(read.text).not.toInclude('OUTPUT TRUNCATED');
    expect(read.text).not.toInclude('Output has been saved to');
  },
  27_000,
);

test.skipIf(!isContractRun)(
  'it passes a filler past the limit in tokens whole with the cut notice after it',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'past-page-limit-cut');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(read.text).toInclude('Log 299: ');
    expect(read.text).toInclude(`OUTPUT TRUNCATED - exceeded ${toolOutputLimitTokens} token limit`);
    expect(read.text).not.toInclude('Output has been saved to');
  },
  27_000,
);

test.skipIf(!isContractRun)(
  'it passes every item of a result in the recall shape to the model',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'recall-shape');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    invariant(read);

    expect(read.text).toInclude('k000000000');
    expect(read.text).toInclude('k000000149');
    expect(read.text).not.toInclude('OUTPUT TRUNCATED');
  },
  27_000,
);

test.skipIf(!isContractRun)(
  'it reads the model at under 12,000 tokens for a page limit of items in the recall shape',
  async () => {
    const ctx = await setupTest();
    const probe = await runToolOutputProbe(ctx.target, 'recall-shape');

    const read = collectToolCalls(probe.run.messages).at(0)?.result;

    // each reply reports the new input tokens and those read from or written to the cache
    const inputTokens = probe.run.messages.flatMap((message) =>
      message.type === 'assistant'
        ? [
            message.message.usage.input_tokens +
              (message.message.usage.cache_read_input_tokens ?? 0) +
              (message.message.usage.cache_creation_input_tokens ?? 0),
          ]
        : [],
    );

    invariant(read);

    const withoutResult = inputTokens.at(0);
    const withResult = inputTokens.at(-1);

    invariant(withoutResult !== undefined && withResult !== undefined);

    const resultTokens = withResult - withoutResult;
    const bytesPerToken = Buffer.byteLength(read.text) / resultTokens;

    expect(recallPageLimitBytes / bytesPerToken).toBeLessThan(toolOutputLimitTokens);
  },
  27_000,
);
