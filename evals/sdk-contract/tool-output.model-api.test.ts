import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  collectToolCalls,
  runToolOutputProbe,
} from '@heynixie/conversation/sdk-contract';
import { toolOutputLimitTokens } from '@heynixie/wire';
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
  16_000,
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
  13_000,
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
  16_000,
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
  16_000,
);
