import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  runMissingSessionProbe,
  runResumeAtProbe,
} from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-resume-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it answers from the boundary when a fork resumes at a message before a later turn',
  async () => {
    const ctx = await setupTest();
    const run = await runResumeAtProbe(ctx.target, 'later-turn');

    const result = run.fork.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
    expect(result.session_id).not.toBe(run.sessionID);
    expect(run.after).toStrictEqual(run.before);
  },
  32_000,
);

test.skipIf(!isContractRun)(
  'it answers from the boundary when a fork resumes at a message before an aborted turn',
  async () => {
    const ctx = await setupTest();
    const run = await runResumeAtProbe(ctx.target, 'aborted-turn');

    const result = run.fork.messages.at(-1);

    expect(run.seed.thrown).toInclude('aborted');
    expect(JSON.stringify(run.before)).toInclude('CHERRY');

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
  },
  97_000,
);

test.skipIf(!isContractRun)(
  'it refuses a resume at a boundary that a later compaction left out',
  async () => {
    const ctx = await setupTest();
    const run = await runResumeAtProbe(ctx.target, 'compacted-turn');

    expect(run.seed.messages).toPartiallyContain({
      type: 'system',
      subtype: 'compact_boundary',
    });

    expect(run.fork.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      errors: [expect.stringMatching(/^No message found with message\.uuid of: /u)],
    });
  },
  45_000,
);

test.skipIf(!isContractRun)(
  'it ends a resume of a session the config directory does not hold in an error result that names the missing session',
  async () => {
    const ctx = await setupTest();
    const run = await runMissingSessionProbe(ctx.target);

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      errors: [expect.stringMatching(/^No conversation found with session ID: /u)],
    });
  },

  // The CLI's cold start in a fresh checkout took 5.9 s once, against 0.4 s warm.
  12_000,
);
