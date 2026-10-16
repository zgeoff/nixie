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
  'memory.recall.checked': 'memory.recall.checked',
  'memory.forget.key_removed': 'memory.forget.key_removed',
  'memory.offer.saved': 'memory.offer.saved',
  'writer.batch.planned': 'writer.batch.planned',
  'writer.batch.extracted': 'writer.batch.extracted',
  'writer.batch.gated': 'writer.batch.gated',
  'writer.publish.inside': 'writer.publish.inside',
  'writer.publish.before': 'writer.publish.before',
  'writer.publish.after': 'writer.publish.after',
};

// The IDs that only a test build may hold: every fault point, the test rule's ID, and a text that
// only the test sandbox holds, the error of its tool relay, so the release build refuses a bundle
// that could run a guest with no isolation.
export const testBuildIDs: readonly string[] = [
  ...new Set(Object.values(faultPointTexts)),
  'test.allow-send',
  'the tool relay has no TCP address',
];
