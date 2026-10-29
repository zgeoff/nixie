import { expect, test } from 'bun:test';
import { buildControlledFields } from './build-controlled-fields';

test.each([
  ['task.pause_requested', { kind: 'task.pause_requested' }, { isPauseRequested: true }],
  [
    'task.paused',
    { kind: 'task.paused', resumeState: 'waiting' },
    { state: 'paused', isPauseRequested: false, resumeState: 'waiting' },
  ],
  [
    'task.resumed',
    { kind: 'task.resumed', nextState: 'running' },
    { state: 'running', isPauseRequested: false, resumeState: null },
  ],
  [
    'task.stopped',
    { kind: 'task.stopped', resumeState: 'ready' },
    { state: 'stopped', isPauseRequested: false, resumeState: 'ready' },
  ],
  [
    'task.restarted',
    { kind: 'task.restarted', nextState: 'waiting' },
    { state: 'waiting', resumeState: null },
  ],
  [
    'task.closed',
    { kind: 'task.closed' },
    { state: 'closed', isPauseRequested: false, resumeState: null },
  ],
  ['task.interrupted', { kind: 'task.interrupted' }, {}],
] as const)('it gives the fields that a %s plan changes', (_kind, plan, expected) => {
  expect(buildControlledFields(plan)).toStrictEqual(expected);
});
