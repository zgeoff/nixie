import { expect, test } from 'bun:test';
import { pickTaskResumeAction } from './pick-task-resume-action';

test.each([
  {
    name: 'an unknown task',
    facts: { task: null, isPausedByNixie: true },
    action: 'control',
  },
  {
    name: 'a paused task that nixie does not hold',
    facts: { task: { state: 'paused', isPauseRequested: false }, isPausedByNixie: false },
    action: 'control',
  },
  {
    name: 'a ready task that nixie does not hold',
    facts: { task: { state: 'ready', isPauseRequested: false }, isPausedByNixie: false },
    action: 'control',
  },
  {
    name: 'a paused task',
    facts: { task: { state: 'paused', isPauseRequested: false }, isPausedByNixie: true },
    action: 'control_then_exempt',
  },
  {
    name: 'a running task with a pause request',
    facts: { task: { state: 'running', isPauseRequested: true }, isPausedByNixie: true },
    action: 'control_then_exempt',
  },
  {
    name: 'a running task with no pause request',
    facts: { task: { state: 'running', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a ready task',
    facts: { task: { state: 'ready', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a waiting task',
    facts: { task: { state: 'waiting', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a stopped task',
    facts: { task: { state: 'stopped', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a failed task',
    facts: { task: { state: 'failed', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a done task',
    facts: { task: { state: 'done', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
  {
    name: 'a closed task',
    facts: { task: { state: 'closed', isPauseRequested: false }, isPausedByNixie: true },
    action: 'exempt',
  },
] as const)('it picks $action for $name', (row) => {
  expect(pickTaskResumeAction(row.facts)).toBe(row.action);
});
