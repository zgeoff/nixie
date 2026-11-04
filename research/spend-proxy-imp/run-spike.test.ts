import { expect, test } from 'bun:test';
import { http, HttpResponse } from 'msw';
// @boundaries-ignore a spike imports the code it measures
import { mockServer } from '../../libs/mock-server/src/index.ts';
import { createSpikeClient, runSpike } from './run-spike.ts';

// MSW answers the preview's API on preview.test; the host, the reader and the scratch directory
// are stand-ins
function setupTest() {
  const outputs = new Map<string, string>();

  return {
    target: { impCLI: 'impz', imp: 'pv-1', composeFile: 'compose.yaml', spendDir: '/spend' },
    outputs,
    deps: {
      client: createSpikeClient('http://preview.test', 'spike-token'),
      host: async () => '{"dollars":0,"tokens":0}\n',
      readTurnUsage: async () => '{"thread":"all","turns":0,"tokens":0}\n',
      writeOutput: async (file: string, text: string) => {
        outputs.set(file, text);
      },
      sleep: async () => {},
      log: () => {},
    },
  };
}

test("it fails with the guest probes' stderr when they exit 1", () => {
  const ctx = setupTest();
  mockServer.use(
    http.post('http://preview.test/rpc/conversation/send', () =>
      HttpResponse.json({ json: { duplicate: false, sequence: 10 } }),
    ),
    http.post('http://preview.test/rpc/conversation/read', () =>
      HttpResponse.json({
        json: {
          hasEarlier: false,
          readAtSequence: 12,
          records: [{ kind: 'model.reply', sequence: 11, thread: 'conversation' }],
          lastStepEnd: { kind: 'task.step_committed', sequence: 12, thread: 'conversation' },
        },
      }),
    ),
    http.post('http://preview.test/rpc/tasks/list', () =>
      HttpResponse.json({ json: { readAtSequence: 12, tasks: [] } }),
    ),
  );

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      runGuestProbes: async () => ({ exitCode: 1, output: '', errors: 'sh: curl: not found\n' }),
    }),
  ).rejects.toThrow('the guest probes exited 1: sh: curl: not found');
});

test('it writes the output of each step when the guest probes pass', async () => {
  const ctx = setupTest();
  mockServer.use(
    http.post('http://preview.test/rpc/conversation/send', () =>
      HttpResponse.json({ json: { duplicate: false, sequence: 10 } }),
    ),
    http.post('http://preview.test/rpc/conversation/read', () =>
      HttpResponse.json({
        json: {
          hasEarlier: false,
          readAtSequence: 12,
          records: [{ kind: 'model.reply', sequence: 11, thread: 'conversation' }],
          lastStepEnd: { kind: 'task.step_committed', sequence: 12, thread: 'conversation' },
        },
      }),
    ),
    http.post('http://preview.test/rpc/tasks/list', () =>
      HttpResponse.json({ json: { readAtSequence: 12, tasks: [] } }),
    ),
  );

  await runSpike(ctx.target, {
    ...ctx.deps,
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
  let reads = 0;
  mockServer.use(
    http.post('http://preview.test/rpc/conversation/send', () =>
      HttpResponse.json({ json: { duplicate: false, sequence: 10 } }),
    ),
    http.post('http://preview.test/rpc/conversation/read', () => {
      reads += 1;

      return HttpResponse.json({
        json:
          reads < 3
            ? {
                hasEarlier: false,
                readAtSequence: 10,
                records: [{ kind: 'conversation.message', sequence: 10, thread: 'conversation' }],
                lastStepEnd: null,
              }
            : {
                hasEarlier: false,
                readAtSequence: 12,
                records: [{ kind: 'model.reply', sequence: 11, thread: 'conversation' }],
                lastStepEnd: { kind: 'task.step_committed', sequence: 12, thread: 'conversation' },
              },
      });
    }),
    http.post('http://preview.test/rpc/tasks/list', () =>
      HttpResponse.json({ json: { readAtSequence: 12, tasks: [] } }),
    ),
  );

  await runSpike(ctx.target, {
    ...ctx.deps,
    runGuestProbes: async () => ({ exitCode: 0, output: 'own-route\t429\t{}\n', errors: '' }),
  });

  // the plain turn ends on its 3rd read, and the task turn on its 1st
  expect(reads).toBe(4);
});

test('it fails when the step never ends in 60 reads', () => {
  const ctx = setupTest();
  mockServer.use(
    http.post('http://preview.test/rpc/conversation/send', () =>
      HttpResponse.json({ json: { duplicate: false, sequence: 10 } }),
    ),
    http.post('http://preview.test/rpc/conversation/read', () =>
      HttpResponse.json({
        json: {
          hasEarlier: false,
          readAtSequence: 10,
          records: [{ kind: 'conversation.message', sequence: 10, thread: 'conversation' }],
          lastStepEnd: null,
        },
      }),
    ),
  );

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      runGuestProbes: async () => ({ exitCode: 0, output: '', errors: '' }),
    }),
  ).rejects.toThrow('the plain turn did not end in 5 minutes');
});
