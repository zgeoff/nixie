import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runOneOfStartProbe } from '@heynixie/conversation/sdk-contract';
import { oneOfStartHarnesses } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { z } from 'zod';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-one-of-start-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const codingStart = {
    runner: z.literal('atc'),
    name: z.string().min(1),
    brief: z.string().min(1),
    target: z.string().optional(),
    agent: z.string().optional(),
    model: z.string().optional(),
    wake: z.array(z.enum(['waiting', 'idle', 'ended'])).optional(),
  };

  const repo = z.strictObject({ url: z.string().min(1), ref: z.string().min(1) });
  const start = z.strictObject({ ...codingStart, repo });
  const joined = z.strictObject({ ...codingStart, session: z.string().min(1) });

  return {
    target: { directory, env: buildContractEnv(process.env, directory) },
    codingStartSchema: z.union([start, joined]),
  };
}

test.skipIf(!isContractRun)(
  'it lists the agent-sdk harness for the oneOf start input only while the model calls that tool with the coding variant',
  async () => {
    const ctx = await setupTest();
    const probe = await runOneOfStartProbe(ctx.target);

    const result = probe.run.messages.at(-1);

    invariant(result?.type === 'result', 'the probe ended with no result message');

    const [call] = probe.calls;

    const isCallParsed =
      probe.run.thrown === null &&
      result.subtype === 'success' &&
      probe.calls.length === 1 &&
      ctx.codingStartSchema.safeParse(call).success;

    // A failing probe keeps the harness out of the list, so the coding variant stays off the
    // start tool on it. A passing probe means the list should name the harness.
    expect(oneOfStartHarnesses.includes('agent-sdk')).toBe(isCallParsed);
  },
  60_000,
);
