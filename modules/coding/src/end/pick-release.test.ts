import { expect, test } from 'bun:test';
import type { RunnerEndCause } from '@heynixie/tasks';
import type { SessionOrigin } from '../types';
import type { Release } from './pick-release';
import { pickRelease } from './pick-release';

test('it picks no release for a task that bound no session', () => {
  expect(
    pickRelease({
      binding: null,
      cause: 'stopped',
      definitions: { snapshotHash: 'snapshot-1' },
      causeSequence: 40,
    }),
  ).toStrictEqual({ kind: 'none' });
});

test('it picks no release for a task that already let go of its session', () => {
  expect(
    pickRelease({
      binding: {
        taskID: 'task-1',
        adapter: 'atc',
        sessionID: 'session-1',
        origin: 'started',
        state: 'ended',
        wake: ['waiting'],
        hop: 0,
        fromCursor: '0',
        lastEventAt: 1_772_445_600_000,
        unboundAt: 1_772_445_700_000,
        heldAnswers: [],
      },
      cause: 'stopped',
      definitions: { snapshotHash: 'snapshot-1' },
      causeSequence: 40,
    }),
  ).toStrictEqual({ kind: 'none' });
});

test.each<[SessionOrigin, RunnerEndCause, Release]>([
  [
    'started',
    'stopped',
    {
      kind: 'commit',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'stopped' },
        },
      ],
      actions: [
        {
          tool: 'coding.stop',
          args: { session: 'atc:session-1', origin: 'started' },
          hashParts: ['stop'],
          causedBy: { kind: 'record', sequence: 40 },
        },
      ],
    },
  ],
  [
    'joined',
    'stopped',
    {
      kind: 'commit',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'stopped' },
        },
      ],
      actions: [
        {
          tool: 'coding.stop',
          args: { session: 'atc:session-1', origin: 'joined' },
          hashParts: ['stop'],
          causedBy: { kind: 'record', sequence: 40 },
        },
      ],
    },
  ],
  [
    'joined',
    'closed',
    {
      kind: 'commit',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'closed' },
        },
      ],
      actions: [],
    },
  ],
  [
    'joined',
    'failed',
    {
      kind: 'commit',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'failed' },
        },
      ],
      actions: [],
    },
  ],
  [
    'started',
    'closed',
    {
      kind: 'stop_first',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'closed' },
        },
      ],
    },
  ],
  [
    'started',
    'failed',
    {
      kind: 'stop_first',
      records: [
        {
          kind: 'coding.session_unbound',
          definitions: { snapshotHash: 'snapshot-1' },
          thread: 'task-1',
          payload: { taskID: 'task-1', adapter: 'atc', sessionID: 'session-1', cause: 'failed' },
        },
      ],
    },
  ],
])('it picks the release of a %s session whose task %s', (origin, cause, release) => {
  expect(
    pickRelease({
      binding: {
        taskID: 'task-1',
        adapter: 'atc',
        sessionID: 'session-1',
        origin,
        state: 'running',
        wake: ['waiting'],
        hop: 0,
        fromCursor: '0',
        lastEventAt: null,
        unboundAt: null,
        heldAnswers: [],
      },
      cause,
      definitions: { snapshotHash: 'snapshot-1' },
      causeSequence: 40,
    }),
  ).toStrictEqual(release);
});
