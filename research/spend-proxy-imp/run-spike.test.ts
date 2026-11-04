import { expect, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { store } from '../../apps/web/src/mocks/store.ts';
// @boundaries-ignore a spike imports the code it measures
import { webOrigin } from '../../apps/web/src/mocks/web-origin.ts';
import { createSpikeClient } from './create-spike-client.ts';
import { runSpike } from './run-spike.ts';
import { makeAnswerQueue } from './test-utils/make-answer-queue.ts';

// The web client's mock of nixie's API answers the real client from its store, which each test
// seeds. The runner sleeps between reads of a thread, so each sleep takes the next change to the
// store from the test's queue: the part the model plays on a real preview.
function setupTest() {
  const outputs = new Map<string, string>();

  return {
    target: { impCLI: 'impz', imp: 'pv-1', composeFile: 'compose.yaml', spendDir: '/spend' },
    outputs,
    deps: {
      client: createSpikeClient(webOrigin, 'spike-token'),
      host: async () => '{"dollars":0,"tokens":0}\n',
      readTurnUsage: async () => '{"thread":"all","turns":0,"tokens":0}\n',
      writeOutput: async (file: string, text: string) => {
        outputs.set(file, text);
      },
      log: () => {},
    },
  };
}

test("it fails with the guest probes' stderr when they exit 1", async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  const nextChange = makeAnswerQueue([
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'Four.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'No task.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
  ]);

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      sleep: async () => {
        await nextChange()();
      },
      runGuestProbes: async () => ({ exitCode: 1, output: '', errors: 'sh: curl: not found\n' }),
    }),
  ).rejects.toThrow('the guest probes exited 1: sh: curl: not found');
});

test('it writes the output of each step when the guest probes pass', async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  const nextChange = makeAnswerQueue([
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'Four.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'No task.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
  ]);

  await runSpike(ctx.target, {
    ...ctx.deps,
    sleep: async () => {
      await nextChange()();
    },
    runGuestProbes: async () => ({ exitCode: 0, output: 'own-route\t429\t{}\n', errors: '' }),
  });

  expect([...ctx.outputs.keys()]).toStrictEqual([
    'route.txt',
    'count-0.json',
    'plain.jsonl',
    'count-1.json',
    'task.jsonl',
    'count-2.json',
    'turn-usage.jsonl',
    'probes.tsv',
    'probes-stderr.txt',
    'count-3.json',
    'audit.txt',
  ]);
});

test('it reads the thread again until the step ends', async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  const nextChange = makeAnswerQueue([
    async () => {},
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'Four.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
    async () => {
      await store.records.create({ kind: 'model.reply', message: { text: 'No task.' } });
      await store.records.create({ kind: 'task.step_committed' });
    },
  ]);

  await runSpike(ctx.target, {
    ...ctx.deps,
    sleep: async () => {
      await nextChange()();
    },
    runGuestProbes: async () => ({ exitCode: 0, output: '', errors: '' }),
  });

  expect(ctx.outputs.get('plain.jsonl')).toBe(
    [
      '{"sequence":1,"kind":"owner_message","text":"What is two plus two? Answer in one short sentence."}',
      '{"sequence":2,"kind":"model.reply","text":"Four."}',
      '{"sequence":3,"kind":"task.step_committed"}',
      '',
    ].join('\n'),
  );
});

test('it fails when the step never ends in 60 reads', async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      sleep: async () => {},
      runGuestProbes: async () => ({ exitCode: 0, output: '', errors: '' }),
    }),
  ).rejects.toThrow('the plain turn did not end in 5 minutes');
});
