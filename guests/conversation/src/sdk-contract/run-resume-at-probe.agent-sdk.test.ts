import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runResumeAtProbe } from './run-resume-at-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-resume-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it sends only the turns up to the boundary when a fork resumes at a message before a later turn', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'OK' }, { text: 'OK' }, { text: 'APPLE' });

  const run = await runResumeAtProbe(ctx.target, 'later-turn');

  const forked = ctx.model.requests.findLast((request) => request.path === '/v1/messages');
  const messages = JSON.stringify(forked?.body?.messages);

  expect([
    messages.includes('The code word is APPLE.'),
    messages.includes('The code word is now BANANA.'),
  ]).toStrictEqual([true, false]);

  expect(run.fork.messages.at(-1)).toMatchObject({ type: 'result', subtype: 'success' });
  expect(run.fork.messages.at(-1)?.session_id).not.toBe(run.sessionID);
  expect(run.after).toStrictEqual(run.before);
});

test('it sends only the turns up to the boundary when a fork resumes at a message before an aborted turn', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK' },
    { text: 'Once upon a tide', isEndless: true },
    { text: 'APPLE' },
  );

  const run = await runResumeAtProbe(ctx.target, 'aborted-turn');

  const forked = ctx.model.requests.findLast((request) => request.path === '/v1/messages');
  const messages = JSON.stringify(forked?.body?.messages);

  expect(run.seed.thrown).toInclude('aborted');
  expect(JSON.stringify(run.before)).toInclude('CHERRY');

  expect([
    messages.includes('The code word is APPLE.'),
    messages.includes('The code word is now CHERRY.'),
  ]).toStrictEqual([true, false]);
});

test('it refuses a resume at a boundary that a later compaction left out', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { text: 'OK' },
    { text: 'OK' },
    { text: 'OK' },
    { text: '<summary>The owner set the code word to CHERRY.</summary>' },
  );

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
});
