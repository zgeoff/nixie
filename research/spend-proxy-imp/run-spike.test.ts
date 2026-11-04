import { expect, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { store } from '../../apps/web/src/mocks/store.ts';
// @boundaries-ignore a spike imports the code it measures
import { webOrigin } from '../../apps/web/src/mocks/web-origin.ts';
import { createSpikeClient } from './create-spike-client.ts';
import { runSpike } from './run-spike.ts';
import { makeAnswerQueue } from './test-utils/make-answer-queue.ts';
import type { MockChange } from './test-utils/seed-mock-change.ts';
import { seedMockChange } from './test-utils/seed-mock-change.ts';

// The web client's mock of nixie's API answers the real client from its store, which each test
// seeds. The runner sleeps between reads of a thread, so each sleep writes the next change from the
// test's queue to the store: the part the model plays on a real preview.
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
  const nextChange = makeAnswerQueue<MockChange>([
    {
      records: [
        { kind: 'model.reply', text: 'Four.' },
        { kind: 'task.step_committed', readCursor: 1 },
      ],
    },
    {
      records: [
        { kind: 'model.reply', text: 'No task.' },
        { kind: 'task.step_committed', readCursor: 4 },
      ],
    },
  ]);

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      sleep: async () => {
        await seedMockChange(nextChange());
      },
      runGuestProbes: async () => ({ exitCode: 1, output: '', errors: 'sh: curl: not found\n' }),
    }),
  ).rejects.toThrow('the guest probes exited 1: sh: curl: not found');
});

test('it writes the output of each step when the guest probes pass', async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  const nextChange = makeAnswerQueue<MockChange>([
    {
      records: [
        { kind: 'model.reply', text: 'Four.' },
        { kind: 'task.step_committed', readCursor: 1 },
      ],
    },
    {
      records: [
        { kind: 'model.reply', text: 'No task.' },
        { kind: 'task.step_committed', readCursor: 4 },
      ],
    },
  ]);

  const nextHostAnswer = makeAnswerQueue([
    'grant preview-model-counted /pv-1/**\n',
    'egress open\n',
    'pv-1\nbase_url: https://api.anthropic.com/pv-1\n',
    'none\n',
    '{"dollars":0,"tokens":0}\n',
    '{"dollars":0.01,"tokens":120}\n',
    '{"dollars":0.02,"tokens":240}\n',
    'credential preview-model-counted POST /pv-1/v1/messages\n',
    'refused outside-filter POST /v1/messages\n',
  ]);

  await runSpike(ctx.target, {
    ...ctx.deps,
    host: async () => nextHostAnswer(),
    readTurnUsage: async () => '{"thread":"all","turns":2,"tokens":240}\n',
    sleep: async () => {
      await seedMockChange(nextChange());
    },
    runGuestProbes: async () => ({ exitCode: 0, output: 'own-route\t429\t{}\n', errors: '' }),
  });

  expect([...ctx.outputs]).toStrictEqual([
    [
      'route.txt',
      'grant preview-model-counted /pv-1/**\negress open\npv-1\nbase_url: https://api.anthropic.com/pv-1\n',
    ],
    ['count-0.json', 'none\n'],
    [
      'plain.jsonl',
      [
        '{"sequence":1,"kind":"owner_message","text":"What is two plus two? Answer in one short sentence."}',
        '{"sequence":2,"kind":"model.reply","text":"Four."}',
        '{"sequence":3,"kind":"task.step_committed"}',
        '',
      ].join('\n'),
    ],
    ['count-1.json', '{"dollars":0,"tokens":0}\n'],
    [
      'task.jsonl',
      [
        `{"sequence":4,"kind":"owner_message","text":"Start a task named 'tide note' whose brief is: write one sentence on why the sea has tides. Then tell me you started it."}`,
        '{"sequence":5,"kind":"model.reply","text":"No task."}',
        '{"sequence":6,"kind":"task.step_committed"}',
        '',
      ].join('\n'),
    ],
    ['count-2.json', '{"dollars":0.01,"tokens":120}\n'],
    ['turn-usage.jsonl', '{"thread":"all","turns":2,"tokens":240}\n'],
    ['probes.tsv', 'own-route\t429\t{}\n'],
    ['probes-stderr.txt', ''],
    ['count-3.json', '{"dollars":0.02,"tokens":240}\n'],
    [
      'audit.txt',
      'credential preview-model-counted POST /pv-1/v1/messages\nrefused outside-filter POST /v1/messages\n',
    ],
  ]);
});

test('it reads the thread again until the step ends', async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  const nextChange = makeAnswerQueue<MockChange>([
    {},
    {
      records: [
        { kind: 'model.reply', text: 'Four.' },
        { kind: 'task.step_committed', readCursor: 1 },
      ],
    },
    {
      records: [
        { kind: 'model.reply', text: 'No task.' },
        { kind: 'task.step_committed', readCursor: 4 },
      ],
    },
  ]);

  await runSpike(ctx.target, {
    ...ctx.deps,
    sleep: async () => {
      await seedMockChange(nextChange());
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

test("it waits for the new task's step and writes its thread", async () => {
  const ctx = setupTest();
  await store.sessions.create({ token: 'spike-token' });
  await store.tasks.create({ taskID: 'task-harbour', name: 'harbour note' });
  const nextChange = makeAnswerQueue<MockChange>([
    {
      records: [
        { kind: 'model.reply', text: 'Four.' },
        { kind: 'task.step_committed', readCursor: 1 },
      ],
    },
    {
      tasks: [{ taskID: 'task-tide', name: 'tide note' }],
      records: [
        { kind: 'model.reply', text: 'Started it.' },
        { kind: 'task.step_committed', readCursor: 4 },
      ],
    },
    {},
    {
      records: [
        { kind: 'task.message', thread: 'task-tide' },
        { kind: 'task.step_committed', thread: 'task-tide' },
      ],
    },
  ]);

  await runSpike(ctx.target, {
    ...ctx.deps,
    sleep: async () => {
      await seedMockChange(nextChange());
    },
    runGuestProbes: async () => ({ exitCode: 0, output: '', errors: '' }),
  });

  expect(ctx.outputs.get('task-thread.jsonl')).toBe(
    [
      '{"sequence":7,"kind":"task.message"}',
      '{"sequence":8,"kind":"task.step_committed"}',
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
