import type { FaultPointID } from '@heynixie/tasks';

// The text each fault point leaves in a test build. The record covers every fault point ID, so a
// new fault point fails the typecheck until it is listed here. recovery.step.<n> is one template
// over the recovery steps.
const faultPointTexts: Readonly<Record<FaultPointID, string>> = {
  'claim.after': 'claim.after',
  'renew.before': 'renew.before',
  'renew.after': 'renew.after',
  'step.commit.before': 'step.commit.before',
  'step.commit.after': 'step.commit.after',
  'queue.commit.before': 'queue.commit.before',
  'queue.commit.after': 'queue.commit.after',
  'attempt.record.after': 'attempt.record.after',
  'attempt.result.before': 'attempt.result.before',
  'attempt.result.after': 'attempt.result.after',
  'timer.fire.before': 'timer.fire.before',
  'inbox.write.after': 'inbox.write.after',
  'recovery.step.1': 'recovery.step.',
  'recovery.step.2': 'recovery.step.',
  'recovery.step.3': 'recovery.step.',
  'recovery.step.4': 'recovery.step.',
  'recovery.step.5': 'recovery.step.',
  'sigterm.grace': 'sigterm.grace',
  'memory.recall.ranked': 'memory.recall.ranked',
  'memory.forget.key_removed': 'memory.forget.key_removed',
};

// The IDs that only a test build may hold: every fault point, and the test rule's ID.
export const testBuildIDs: readonly string[] = [
  ...new Set(Object.values(faultPointTexts)),
  'test.allow-send',
];
