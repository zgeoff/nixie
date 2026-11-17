import { expect, test } from 'bun:test';
import { formatWorkerLine } from './format-worker-line';

test('it shows the outcome and the usage of an ended worker run', () => {
  const line = formatWorkerLine(
    {
      call: { callID: 'call-1', tool: 'worker.run' },
      calls: [],
      end: {
        isCut: false,
        outcome: 'answered',
        record: { sequence: 5, thread: 't' },
        used: { minutes: 1.5, turns: 2, tokens: 12_345, dollars: 0.034 },
      },
      model: 'claude-test-1',
      shortID: 'w7k2m9qa4x',
      turns: [],
      workerRunID: 'w1',
    },
    'Which seeds came in the order?',
  );

  expect(line).toBe(
    'worker w7k2m9qa4x · claude-test-1 · Which seeds came in the order? · answered · 1.5 min · 2 turns · 12k tokens · $0.03',
  );
});

test('it shows a running worker run with the turns and dollars so far', () => {
  const line = formatWorkerLine(
    {
      call: { callID: 'call-1', tool: 'worker.run' },
      calls: [],
      shortID: 'w7k2m9qa4x',
      turns: [
        {
          dollars: 0.01,
          isCut: false,
          isForgotten: false,
          record: { sequence: 3, thread: 't' },
          tokens: 10,
          turn: 1,
        },
        {
          dollars: 0.02,
          isCut: false,
          isForgotten: false,
          record: { sequence: 4, thread: 't' },
          tokens: 10,
          turn: 2,
        },
      ],
      workerRunID: 'w1',
    },
    undefined,
  );

  expect(line).toBe('worker w7k2m9qa4x · running · 2 turns · $0.03');
});

test('it cuts a long question to its start', () => {
  const line = formatWorkerLine(
    {
      call: { callID: 'call-1', tool: 'worker.run' },
      calls: [],
      turns: [],
      workerRunID: 'w1',
    },
    'q'.repeat(100),
  );

  expect(line).toBe(`worker · ${'q'.repeat(60)}… · running · 0 turns · $0.00`);
});

test('it leaves the model out of a worker line that has none', () => {
  const line = formatWorkerLine(
    { call: { callID: 'call-1', tool: 'worker.run' }, calls: [], turns: [], workerRunID: 'w1' },
    undefined,
  );

  expect(line).toBe('worker · running · 0 turns · $0.00');
});
