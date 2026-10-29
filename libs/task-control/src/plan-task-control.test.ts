import { expect, test } from 'bun:test';
import { planTaskControl } from './plan-task-control';

test.each([
  [
    'pause',
    'ready',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.paused', resumeState: 'ready' },
  ],
  [
    'pause',
    'waiting',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.paused', resumeState: 'waiting' },
  ],
  [
    'pause',
    'running',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.pause_requested' },
  ],
  [
    'resume',
    'running',
    { isPauseRequested: true, resumeState: null },
    { kind: 'task.resumed', nextState: 'running' },
  ],
  [
    'resume',
    'paused',
    { isPauseRequested: false, resumeState: 'waiting' },
    { kind: 'task.resumed', nextState: 'waiting' },
  ],
  [
    'stop',
    'paused',
    { isPauseRequested: false, resumeState: 'waiting' },
    { kind: 'task.stopped', resumeState: 'waiting' },
  ],
  [
    'stop',
    'running',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.stopped', resumeState: 'ready' },
  ],
  [
    'restart',
    'stopped',
    { isPauseRequested: false, resumeState: 'waiting' },
    { kind: 'task.restarted', nextState: 'waiting' },
  ],
  [
    'restart',
    'failed',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.restarted', nextState: 'ready' },
  ],
  ['close', 'done', { isPauseRequested: false, resumeState: null }, { kind: 'task.closed' }],
  [
    'interrupt',
    'running',
    { isPauseRequested: false, resumeState: null },
    { kind: 'task.interrupted' },
  ],
] as const)('it plans a %s of a %s task', (control, state, pause, expected) => {
  expect(
    planTaskControl(control, {
      state,
      isConversation: false,
      isPauseRequested: pause.isPauseRequested,
      hasUnread: false,
      resumeState: pause.resumeState,
    }),
  ).toStrictEqual(expected);
});

test.each([
  ['pause', 'paused', false],
  ['pause', 'running', true],
  ['resume', 'running', false],
  ['resume', 'waiting', false],
  ['stop', 'stopped', false],
  ['stop', 'done', false],
  ['restart', 'waiting', false],
  ['interrupt', 'waiting', false],
  ['close', 'closed', false],
] as const)('it refuses a %s of a %s task', (control, state, isPauseRequested) => {
  expect(
    planTaskControl(control, {
      state,
      isConversation: false,
      isPauseRequested,
      hasUnread: false,
      resumeState: null,
    }),
  ).toStrictEqual({ reason: 'not_allowed', state, isPauseRequested });
});

test('it resumes a paused task to ready when input waits unread', () => {
  expect(
    planTaskControl('resume', {
      state: 'paused',
      isConversation: false,
      isPauseRequested: false,
      hasUnread: true,
      resumeState: 'waiting',
    }),
  ).toStrictEqual({ kind: 'task.resumed', nextState: 'ready' });
});

test('it refuses to close the conversation', () => {
  expect(
    planTaskControl('close', {
      state: 'waiting',
      isConversation: true,
      isPauseRequested: false,
      hasUnread: false,
      resumeState: null,
    }),
  ).toStrictEqual({ reason: 'conversation_never_closes' });
});
