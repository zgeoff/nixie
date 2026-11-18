import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { buildActivity } from './build-activity';
import { buildSentFilePlacement } from './build-sent-file-placement';

test('it places a sent file after the last reply of its step', () => {
  const activity = buildActivity([
    buildMockLogRecord({ kind: 'task.step_started', sequence: 1 }),
    buildMockLogRecord({
      kind: 'tool_called',
      sequence: 2,
      toolCall: { callID: 'call-1', input: { file: 'p3n8x2c7ke' }, tool: 'file.send' },
    }),
    buildMockLogRecord({
      kind: 'tool_result',
      sequence: 3,
      toolCall: {
        callID: 'call-1',
        content: {
          result: { file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
        },
        outcome: 'result',
      },
    }),
    buildMockLogRecord({ kind: 'model.reply', sequence: 4 }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 5 }),
  ]);

  expect([...buildSentFilePlacement(activity)]).toStrictEqual([
    [
      1,
      [
        {
          callID: 'call-1',
          file: 'p3n8x2c7ke',
          name: 'orders.csv',
          bytes: 812,
          mediaType: 'text/csv',
        },
      ],
    ],
  ]);
});

test('it places a sent file after the step when the step made no reply', () => {
  const activity = buildActivity([
    buildMockLogRecord({ kind: 'task.step_started', sequence: 1 }),
    buildMockLogRecord({
      kind: 'tool_called',
      sequence: 2,
      toolCall: { callID: 'call-1', input: { file: 'p3n8x2c7ke' }, tool: 'file.send' },
    }),
    buildMockLogRecord({
      kind: 'tool_result',
      sequence: 3,
      toolCall: {
        callID: 'call-1',
        content: {
          result: { file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
        },
        outcome: 'result',
      },
    }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 4 }),
  ]);

  expect([...buildSentFilePlacement(activity)]).toStrictEqual([
    [
      0,
      [
        {
          callID: 'call-1',
          file: 'p3n8x2c7ke',
          name: 'orders.csv',
          bytes: 812,
          mediaType: 'text/csv',
        },
      ],
    ],
  ]);
});

test('it leaves a reply of a later step out of the placement', () => {
  const activity = buildActivity([
    buildMockLogRecord({ kind: 'task.step_started', sequence: 1 }),
    buildMockLogRecord({
      kind: 'tool_called',
      sequence: 2,
      toolCall: { callID: 'call-1', input: { file: 'p3n8x2c7ke' }, tool: 'file.send' },
    }),
    buildMockLogRecord({
      kind: 'tool_result',
      sequence: 3,
      toolCall: {
        callID: 'call-1',
        content: {
          result: { file: 'p3n8x2c7ke', name: 'orders.csv', bytes: 812, mediaType: 'text/csv' },
        },
        outcome: 'result',
      },
    }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 4 }),
    buildMockLogRecord({ kind: 'task.step_started', sequence: 5 }),
    buildMockLogRecord({ kind: 'model.reply', sequence: 6 }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 7 }),
  ]);

  expect([...buildSentFilePlacement(activity)]).toStrictEqual([
    [
      0,
      [
        {
          callID: 'call-1',
          file: 'p3n8x2c7ke',
          name: 'orders.csv',
          bytes: 812,
          mediaType: 'text/csv',
        },
      ],
    ],
  ]);
});
