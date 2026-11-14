import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { pickPinnedBrief } from './pick-pinned-brief';
import { buildMockCreatedBrief } from './test-utils/build-mock-created-brief';
import { buildMockMessageBrief } from './test-utils/build-mock-message-brief';

test('it pins no brief for a task with none', () => {
  expect(
    pickPinnedBrief({ brief: null, recent: [], inbox: [], isFirstSession: true }),
  ).toStrictEqual({ pinned: null, briefSequence: null });
});

test('it leaves the brief to the batch when the batch holds its record', () => {
  expect(
    pickPinnedBrief({
      brief: buildMockMessageBrief(),
      recent: [],
      inbox: [
        buildMockLogRecord({ sequence: 16_031, kind: 'task_message' }),
        buildMockLogRecord({ sequence: 16_040, kind: 'task_message' }),
      ],
      isFirstSession: true,
    }),
  ).toStrictEqual({ pinned: null, briefSequence: 16_031 });
});

test('it leaves the brief to the recent turns when they hold its record', () => {
  expect(
    pickPinnedBrief({
      brief: buildMockMessageBrief(),
      recent: [
        { record: buildMockLogRecord({ sequence: 16_031, kind: 'task_message' }), answered: null },
      ],
      inbox: [buildMockLogRecord({ sequence: 16_050, kind: 'task_message' })],
      isFirstSession: false,
    }),
  ).toStrictEqual({ pinned: null, briefSequence: 16_031 });
});

test('it pins the brief of a rebuilt session that holds its record in neither the batch nor the recent turns', () => {
  expect(
    pickPinnedBrief({
      brief: buildMockMessageBrief(),
      recent: [
        { record: buildMockLogRecord({ sequence: 16_045, kind: 'task_message' }), answered: null },
      ],
      inbox: [buildMockLogRecord({ sequence: 16_050, kind: 'task_message' })],
      isFirstSession: false,
    }),
  ).toStrictEqual({ pinned: buildMockMessageBrief(), briefSequence: 16_031 });
});

test('it leaves a brief with no record to the preamble of a first turn', () => {
  expect(
    pickPinnedBrief({
      brief: buildMockCreatedBrief(),
      recent: [],
      inbox: [],
      isFirstSession: true,
    }),
  ).toStrictEqual({ pinned: null, briefSequence: 400 });
});

test('it pins a brief with no record in a session that is no first', () => {
  expect(
    pickPinnedBrief({
      brief: buildMockCreatedBrief(),
      recent: [],
      inbox: [],
      isFirstSession: false,
    }),
  ).toStrictEqual({ pinned: buildMockCreatedBrief(), briefSequence: 400 });
});
