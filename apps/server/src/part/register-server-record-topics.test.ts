import { expect, test } from 'bun:test';
import { collectModuleRecordTopicMaps } from '@heynixie/api';
import { startTestLog } from '@heynixie/log/test-utils';
import { sandboxRecordTopics } from '@heynixie/sandbox';
import { readDeclaredRecordKinds } from '../test-utils/read-declared-record-kinds';
import { registerServerRecordTopics } from './register-server-record-topics';
import { serverRecordTopics } from './server-record-topics';

async function setupTest() {
  // the spend module names two kinds that the models and sessions modules own
  const registered = new Map(
    [...collectModuleRecordTopicMaps(), sandboxRecordTopics, serverRecordTopics].flatMap((map) =>
      Object.entries(map),
    ),
  );

  return { declaredKinds: await readDeclaredRecordKinds(), registered };
}

test('it gives every record kind that a module declares an entry, an empty list included', async () => {
  const ctx = await setupTest();

  // the log registers the kinds it owns when its writer starts
  const logKinds = new Set([
    'log_reset',
    'recovery.started',
    'spend.stop_tripped',
    'spend.stop_cleared',
  ]);

  const withoutEntry = ctx.declaredKinds.filter(
    (kind) => !ctx.registered.has(kind) && !logKinds.has(kind) && !kind.startsWith('nixie.'),
  );

  expect(withoutEntry).toStrictEqual([]);
});

test('it marks the tasks topic for every kind that the task list reads', async () => {
  const ctx = await setupTest();

  const listed = [
    ...ctx.registered
      .keys()
      .filter((kind) => kind.startsWith('task.') || kind.startsWith('action.')),
    'owner_message',
    'task_message',
    'timer.fired',
    'trigger.fired',
    'trigger.skipped',
  ];

  expect(listed.filter((kind) => !ctx.registered.get(kind)?.includes('tasks'))).toStrictEqual([]);
});

test('it marks the tasks topic for every inbox kind', async () => {
  const ctx = await setupTest();

  const inbox = [
    'recovery.notice',
    'policy.action_answered',
    'memory.proposal_rejected',
    'skills.write_rejected',
    'proposals.deferred',
    'proposals.returned',
    'computer.takeover_started',
    'computer.takeover_ended',
    'computer.handover_asked',
    'computer.handover_closed',
  ];

  expect(inbox.filter((kind) => !ctx.registered.get(kind)?.includes('tasks'))).toStrictEqual([]);
});

test('it marks the approvals topic for each proposal kind and each action kind that ends a waiting call', async () => {
  const ctx = await setupTest();

  const approvals = [
    'proposals.deferred',
    'proposals.returned',
    'proposals.withdrawn',
    'policy.action_proposed',
    'policy.action_answered',
    'policy.action_lapsed',
    'rules.rule_proposed',
    'rules.mandate_proposed',
    'memory.proposed',
    'skills.write_proposed',
    'prompts.override_proposed',
    'action.held',
    'action.released',
    'action.unknown_answered',
    'action.outcome',
  ];

  expect(
    approvals.filter((kind) => !ctx.registered.get(kind)?.includes('approvals')),
  ).toStrictEqual([]);
});

test('it marks the computer topic for each handover kind', async () => {
  const ctx = await setupTest();

  const handovers = [...ctx.registered.keys()].filter((kind) =>
    kind.startsWith('computer.handover_'),
  );

  expect(handovers.filter((kind) => !ctx.registered.get(kind)?.includes('computer'))).toStrictEqual(
    [],
  );
});

test('it registers every module on one writer without two owners for a kind', async () => {
  const testLog = await startTestLog();

  expect(() => {
    registerServerRecordTopics(testLog.writer);
  }).not.toThrow();
});
