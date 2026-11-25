import { expect, test } from 'bun:test';
import type { TaskInputEvent } from '@heynixie/triggers';
import type { Binding, SessionEvent, WakeEvent } from '../types';
import { collectTaskInputs } from './collect-task-inputs';

test.each<[string, SessionEvent, WakeEvent[], Pick<TaskInputEvent, 'wake' | 'facts'>]>([
  [
    'ended outside the wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'state',
      state: 'ended',
      question: null,
    },
    [],
    { wake: true, facts: { kind: 'state', state: 'ended' } },
  ],
  [
    'answered',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-1',
      answer: 'Use the staging database.',
    },
    [],
    { wake: true, facts: { kind: 'answered', messageRef: 'note-1' } },
  ],
  [
    'unanswered',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'unanswered',
      messageRef: 'note-2',
      reason: 'expired',
    },
    [],
    { wake: true, facts: { kind: 'unanswered', messageRef: 'note-2' } },
  ],
  [
    'a waiting state in the wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'state',
      state: 'waiting',
      question: 'Which branch?',
    },
    ['waiting'],
    { wake: true, facts: { kind: 'state', state: 'waiting' } },
  ],
  [
    'a blocked note in the wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'note',
      label: 'blocked',
      text: 'The tests need a database.',
    },
    ['blocked'],
    { wake: true, facts: { kind: 'note', label: 'blocked' } },
  ],
])('it wakes the task on %s', (_label, event, wake, input) => {
  const bindings = new Map<string, Binding>([
    [
      'session-1',
      {
        taskID: 'task-1',
        adapter: 'atc',
        sessionID: 'session-1',
        origin: 'started',
        state: 'running',
        wake,
        hop: 2,
        fromCursor: '0',
        lastEventAt: null,
        unboundAt: null,
        heldAnswers: [],
      },
    ],
  ]);

  expect(collectTaskInputs([event], bindings)).toStrictEqual([
    {
      kind: 'task_input',
      taskID: 'task-1',
      dedupeKey: 'event-1',
      occurredAt: '2026-03-02T10:00:00.000Z',
      hop: 2,
      wake: input.wake,
      facts: input.facts,
      payload: { ...event },
    },
  ]);
});

test.each<[string, SessionEvent, WakeEvent[], TaskInputEvent['facts']]>([
  [
    'running, even in a full wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'state',
      state: 'running',
      question: null,
    },
    ['waiting', 'idle', 'ended', 'gone', 'progress', 'blocked', 'decision'],
    { kind: 'state', state: 'running' },
  ],
  [
    'an idle state outside the wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'state',
      state: 'idle',
      question: null,
    },
    ['waiting'],
    { kind: 'state', state: 'idle' },
  ],
  [
    'a progress note outside the wake set',
    {
      session: 'session-1',
      eventKey: 'event-1',
      at: '2026-03-02T10:00:00.000Z',
      kind: 'note',
      label: 'progress',
      text: 'Half the tests pass.',
    },
    ['blocked'],
    { kind: 'note', label: 'progress' },
  ],
])('it keeps the task asleep on %s', (_label, event, wake, facts) => {
  const bindings = new Map<string, Binding>([
    [
      'session-1',
      {
        taskID: 'task-1',
        adapter: 'atc',
        sessionID: 'session-1',
        origin: 'joined',
        state: 'running',
        wake,
        hop: 0,
        fromCursor: '0',
        lastEventAt: null,
        unboundAt: null,
        heldAnswers: [],
      },
    ],
  ]);

  expect(collectTaskInputs([event], bindings)).toStrictEqual([
    {
      kind: 'task_input',
      taskID: 'task-1',
      dedupeKey: 'event-1',
      occurredAt: '2026-03-02T10:00:00.000Z',
      hop: 0,
      wake: false,
      facts,
      payload: { ...event },
    },
  ]);
});

test('it drops the events of a session no task binds and of a binding the task let go of', () => {
  const bindings = new Map<string, Binding>([
    [
      'session-bound',
      {
        taskID: 'task-1',
        adapter: 'atc',
        sessionID: 'session-bound',
        origin: 'started',
        state: 'running',
        wake: ['waiting'],
        hop: 1,
        fromCursor: '0',
        lastEventAt: null,
        unboundAt: null,
        heldAnswers: [],
      },
    ],
    [
      'session-unbound',
      {
        taskID: 'task-2',
        adapter: 'atc',
        sessionID: 'session-unbound',
        origin: 'joined',
        state: 'idle',
        wake: ['waiting'],
        hop: 0,
        fromCursor: '0',
        lastEventAt: 1_772_445_600_000,
        unboundAt: 1_772_445_700_000,
        heldAnswers: [],
      },
    ],
  ]);

  const inputs = collectTaskInputs(
    [
      {
        session: 'session-other',
        eventKey: 'event-1',
        at: '2026-03-02T10:00:00.000Z',
        kind: 'state',
        state: 'waiting',
        question: 'Proceed?',
      },
      {
        session: 'session-unbound',
        eventKey: 'event-2',
        at: '2026-03-02T10:00:01.000Z',
        kind: 'state',
        state: 'waiting',
        question: 'Proceed?',
      },
      {
        session: 'session-bound',
        eventKey: 'event-3',
        at: '2026-03-02T10:00:02.000Z',
        kind: 'state',
        state: 'waiting',
        question: 'Which branch?',
      },
    ],
    bindings,
  );

  expect(inputs).toStrictEqual([
    {
      kind: 'task_input',
      taskID: 'task-1',
      dedupeKey: 'event-3',
      occurredAt: '2026-03-02T10:00:02.000Z',
      hop: 1,
      wake: true,
      facts: { kind: 'state', state: 'waiting' },
      payload: {
        session: 'session-bound',
        eventKey: 'event-3',
        at: '2026-03-02T10:00:02.000Z',
        kind: 'state',
        state: 'waiting',
        question: 'Which branch?',
      },
    },
  ]);
});
