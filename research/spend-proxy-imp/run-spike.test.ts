import { expect, test } from 'bun:test';
import { runSpike } from './run-spike.ts';

// stand-ins for the preview's API, the host and the scratch directory: the API answers every
// thread with a step that replied and committed, and the turn starts no task
function setupTest() {
  const outputs = new Map<string, string>();

  return {
    target: { impCLI: 'impz', imp: 'pv-1', composeFile: 'compose.yaml', spendDir: '/spend' },
    outputs,
    deps: {
      client: {
        conversation: {
          send: async () => ({ duplicate: false, sequence: 10 }),
          read: async () => ({
            hasEarlier: false,
            readAtSequence: 12,
            records: [
              {
                kind: 'model.reply',
                recordedAt: new Date('2026-11-05T09:00:00Z'),
                sequence: 11,
                thread: 'conversation',
                message: { text: 'Four.' },
              },
            ],
            lastStepEnd: {
              kind: 'task.step_committed',
              recordedAt: new Date('2026-11-05T09:00:01Z'),
              sequence: 12,
              thread: 'conversation',
            },
          }),
        },
        tasks: { list: async () => ({ readAtSequence: 12, tasks: [] }) },
      },
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

test('it fails with the guest probes\' stderr when they exit 1', () => {
  const ctx = setupTest();

  expect(
    runSpike(ctx.target, {
      ...ctx.deps,
      runGuestProbes: async () => ({ exitCode: 1, output: '', errors: 'sh: curl: not found\n' }),
    }),
  ).rejects.toThrow(
    'the guest probes exited 1: sh: curl: not found',
  );
});

test('it writes the output of each step when the guest probes pass', async () => {
  const ctx = setupTest();

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
