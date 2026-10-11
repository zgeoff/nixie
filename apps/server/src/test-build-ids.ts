// The IDs that only a test build may hold: every slice 1 fault point in the crash tests design, and
// the test rule's ID. trigger.deliver.before waits for the trigger source in slice 6, and
// recovery.step.<n> is one template over the 5 recovery steps.
export const testBuildIDs: readonly string[] = [
  'claim.after',
  'renew.before',
  'renew.after',
  'step.commit.before',
  'step.commit.after',
  'queue.commit.before',
  'queue.commit.after',
  'attempt.record.after',
  'attempt.result.before',
  'attempt.result.after',
  'timer.fire.before',
  'inbox.write.after',
  'recovery.step.',
  'sigterm.grace',
  'test.allow-send',
];
