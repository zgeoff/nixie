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

test('it counts a recall that delivered nothing as a recall', () => {
  const started = buildMockLogRecord({ kind: 'task.step_started', sequence: 1 });
  const recalled = buildMockLogRecord({
    kind: 'memory.recalled',
    recall: { items: [] },
    sequence: 2,
  });

  expect(buildActivity([started, recalled])).toMatchObject([{ memories: [] }]);
});
