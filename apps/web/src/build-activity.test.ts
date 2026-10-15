import { expect, test } from 'bun:test';
import { buildActivity } from './build-activity';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';

test('it keeps each message on its own and folds a step into one group', () => {
  const question = buildMockLogRecord({
    kind: 'owner_message',
    message: { text: '?' },
    sequence: 1,
  });

  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 2,
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });

  const called = buildMockLogRecord({
    kind: 'tool_called',
    sequence: 3,
    toolCall: { callID: 'call-1', input: { url: 'https://theverge.com/' }, tool: 'web_fetch' },
  });

  const result = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 4,
    toolCall: { callID: 'call-1', content: { result: { status: 200 } }, outcome: 'result' },
  });

  const reply = buildMockLogRecord({ kind: 'model.reply', message: { text: '!' }, sequence: 5 });
  const ended = buildMockLogRecord({ kind: 'model.turn_ended', sequence: 6 });
  const committed = buildMockLogRecord({ kind: 'task.step_committed', sequence: 7 });

  expect(buildActivity([question, started, called, result, reply, ended, committed])).toStrictEqual(
    [
      { kind: 'message', record: question },
      {
        calls: [
          {
            callID: 'call-1',
            content: { result: { status: 200 } },
            input: { url: 'https://theverge.com/' },
            outcome: 'result',
            tool: 'web_fetch',
          },
        ],
        durationMs: expect.toBeNumber(),
        key: 2,
        kind: 'step',
        records: [started, called, result, ended, committed],
        status: 'done',
        stepKey: 'step-1',
        taskID: 'conversation',
      },
      { kind: 'message', record: reply },
    ],
  );
});

test('it keeps a forgotten message on its own in place of folding it into a step', () => {
  const forgotten = buildMockLogRecord({ kind: 'owner_message', sequence: 1 });

  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 2,
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });

  expect(buildActivity([forgotten, started]).at(0)).toStrictEqual({
    kind: 'message',
    record: forgotten,
  });
});

test('it folds a record before a step into the step that follows it', () => {
  const created = buildMockLogRecord({
    kind: 'task.created',
    sequence: 1,
    task: { taskID: 'conversation' },
  });

  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 2,
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });

  expect(buildActivity([created, started])).toStrictEqual([
    {
      calls: [],
      key: 1,
      kind: 'step',
      records: [created, started],
      status: 'running',
      stepKey: 'step-1',
      taskID: 'conversation',
    },
  ]);
});

test.each([
  ['task.step_errored', 'failed'],
  ['task.step_interrupted', 'interrupted'],
])('it marks a step that ends with %s as %s', (kind, status) => {
  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 1,
    task: { taskID: 'conversation' },
  });

  const end = buildMockLogRecord({ kind, sequence: 2, task: { taskID: 'conversation' } });

  expect(buildActivity([started, end])).toMatchObject([{ kind: 'step', status }]);
});

test('it closes a step that started before the page at its end record, with its status', () => {
  const called = buildMockLogRecord({
    kind: 'tool_called',
    sequence: 41,
    toolCall: { callID: 'call-1', tool: 'web_fetch' },
  });

  const result = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 42,
    toolCall: { callID: 'call-1', outcome: 'error' },
  });

  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 43,
    task: { error: 'the fetch timed out', stepKey: 'conversation:2', taskID: 'conversation' },
  });

  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 44 });
  const committed = buildMockLogRecord({ kind: 'task.step_committed', sequence: 45 });

  expect(buildActivity([called, result, errored, started, committed])).toStrictEqual([
    {
      calls: [{ callID: 'call-1', outcome: 'error', tool: 'web_fetch' }],
      error: 'the fetch timed out',
      key: 41,
      kind: 'step',
      records: [called, result, errored],
      status: 'failed',
      stepKey: 'conversation:2',
      taskID: 'conversation',
    },
    {
      calls: [],
      durationMs: expect.toBeNumber(),
      key: 44,
      kind: 'step',
      records: [started, committed],
      status: 'done',
    },
  ]);
});

test.each([
  ['task.step_committed', 'done'],
  ['task.step_errored', 'failed'],
  ['task.step_interrupted', 'interrupted'],
])('it marks a step that started before the page and ends with %s as %s', (kind, status) => {
  const called = buildMockLogRecord({
    kind: 'tool_called',
    sequence: 1,
    toolCall: { callID: 'call-1', tool: 'web_fetch' },
  });

  const end = buildMockLogRecord({ kind, sequence: 2 });

  expect(buildActivity([called, end])).toMatchObject([{ records: [called, end], status }]);
});

test('it carries the error of a failed step', () => {
  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 1,
    task: { stepKey: 'conversation:4', taskID: 'conversation' },
  });

  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 2,
    task: {
      error: 'the model profile is unreachable',
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(buildActivity([started, errored])).toStrictEqual([
    {
      calls: [],
      durationMs: expect.toBeNumber(),
      error: 'the model profile is unreachable',
      key: 1,
      kind: 'step',
      records: [started, errored],
      status: 'failed',
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  ]);
});

test('it joins each result to its call by the call ID', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const first = buildMockLogRecord({
    kind: 'tool_called',
    sequence: 2,
    toolCall: { callID: 'call-a', input: { url: 'https://a.test/' }, tool: 'web_fetch' },
  });

  const second = buildMockLogRecord({
    kind: 'tool_called',
    sequence: 3,
    toolCall: { callID: 'call-b', input: { url: 'https://b.test/' }, tool: 'web_fetch' },
  });

  const secondResult = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 4,
    toolCall: { callID: 'call-b', outcome: 'error' },
  });

  expect(buildActivity([started, first, second, secondResult])).toMatchObject([
    {
      calls: [
        { callID: 'call-a', input: { url: 'https://a.test/' }, tool: 'web_fetch' },
        {
          callID: 'call-b',
          input: { url: 'https://b.test/' },
          outcome: 'error',
          tool: 'web_fetch',
        },
      ],
    },
  ]);
});

test('it groups the records after the last step on their own', () => {
  const created = buildMockLogRecord({
    kind: 'task.created',
    sequence: 1,
    task: { taskID: 'conversation' },
  });

  expect(buildActivity([created])).toStrictEqual([
    { calls: [], key: 1, kind: 'step', records: [created], status: 'done', taskID: 'conversation' },
  ]);
});

test('it times a step from its start to its end', () => {
  const started = buildMockLogRecord({
    kind: 'task.step_started',
    recordedAt: new Date('2026-10-10T12:00:00.000Z'),
    sequence: 1,
  });

  const committed = buildMockLogRecord({
    kind: 'task.step_committed',
    recordedAt: new Date('2026-10-10T12:00:12.300Z'),
    sequence: 2,
  });

  expect(buildActivity([started, committed])).toMatchObject([{ durationMs: 12_300 }]);
});

test('it leaves a running step untimed', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  expect(buildActivity([started])).toStrictEqual([
    { calls: [], key: 1, kind: 'step', records: [started], status: 'running' },
  ]);
});

test('it collects what each recall of a step delivered, in order', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const first = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [{ itemID: 'item-a', score: 0.61, version: 2 }] },
    sequence: 2,
  });

  const second = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [{ itemID: 'item-b', version: 1 }] },
    sequence: 3,
  });

  expect(buildActivity([started, first, second])).toMatchObject([
    {
      memories: [
        { itemID: 'item-a', score: 0.61, version: 2 },
        { itemID: 'item-b', version: 1 },
      ],
    },
  ]);
});

test('it takes the context of the last turn end in a step that recorded one', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const first = buildMockLogRecord({
    context: { size: 34_200, window: 400_000 },
    kind: 'model.turn_ended',
    sequence: 2,
  });

  const second = buildMockLogRecord({
    context: { size: 41_000, window: 400_000 },
    kind: 'model.turn_ended',
    sequence: 3,
  });

  const unreported = buildMockLogRecord({ kind: 'model.turn_ended', sequence: 4 });

  expect(buildActivity([started, first, second, unreported])).toMatchObject([
    { context: { size: 41_000, window: 400_000 } },
  ]);
});

test('it collects each compaction of a step with the sequence of its record, in order', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const first = buildMockLogRecord({
    compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
    kind: 'model.compacted',
    sequence: 2,
  });

  const second = buildMockLogRecord({
    compaction: { preTokens: 391_000, trigger: 'manual' },
    kind: 'model.compacted',
    sequence: 3,
  });

  expect(buildActivity([started, first, second])).toMatchObject([
    {
      compactions: [
        { postTokens: 42_000, preTokens: 384_000, sequence: 2, trigger: 'auto' },
        { preTokens: 391_000, sequence: 3, trigger: 'manual' },
      ],
    },
  ]);
});

test('it counts a recall that delivered nothing as a recall', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const recalled = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [] },
    sequence: 2,
  });

  expect(buildActivity([started, recalled])).toMatchObject([{ memories: [] }]);
});

test('it puts a rating from a later step beside the memory it rates in the step that recalled it', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const recalled = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: {
      items: [
        { itemID: 'item-a', score: 0.61, version: 2 },
        { itemID: 'item-b', version: 1 },
      ],
    },
    sequence: 2,
  });

  const committed = buildMockLogRecord({ kind: 'task.step_committed', sequence: 3 });
  const next = buildMockLogRecord({ kind: 'task.step_started', sequence: 4 });

  const rated = buildMockLogRecord({
    kind: 'memory.rated',
    rating: {
      items: [{ hasNote: true, itemID: 'item-a', verdict: 'noise', version: 2 }],
      ratedBy: 'Pip',
      recalledSequence: 2,
    },
    sequence: 5,
  });

  const [recalling, rating] = buildActivity([started, recalled, committed, next, rated]);

  expect(recalling).toMatchObject({
    memories: [
      {
        itemID: 'item-a',
        rating: { hasNote: true, ratedBy: 'Pip', sequence: 5, verdict: 'noise' },
        score: 0.61,
        version: 2,
      },
      { itemID: 'item-b', version: 1 },
    ],
  });

  expect(rating).not.toContainKey('memories');
});

test('it keeps the latest rating of a memory, and none for another recall of the same version', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });

  const first = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [{ itemID: 'item-a', version: 1 }] },
    sequence: 2,
  });

  const second = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [{ itemID: 'item-a', version: 1 }] },
    sequence: 3,
  });

  const helpful = buildMockLogRecord({
    kind: 'memory.rated',
    rating: {
      items: [{ hasNote: false, itemID: 'item-a', verdict: 'helpful', version: 1 }],
      recalledSequence: 3,
    },
    sequence: 4,
  });

  const misleading = buildMockLogRecord({
    kind: 'memory.rated',
    rating: {
      items: [{ hasNote: false, itemID: 'item-a', verdict: 'misleading', version: 1 }],
      recalledSequence: 3,
    },
    sequence: 5,
  });

  expect(buildActivity([started, first, second, helpful, misleading])).toMatchObject([
    {
      memories: [
        { itemID: 'item-a', version: 1 },
        {
          itemID: 'item-a',
          rating: { hasNote: false, sequence: 5, verdict: 'misleading' },
          version: 1,
        },
      ],
    },
  ]);
});
