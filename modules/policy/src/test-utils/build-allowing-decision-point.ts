import type { DecisionPoint, MemoryWriteFacts } from '../types';

// A decision point that allows every call, for a test of a tool that is not about the decision.
// With memoryWrite, it answers as the real one does for a tool that declares memory_write.
export function buildAllowingDecisionPoint(memoryWrite?: MemoryWriteFacts): DecisionPoint {
  const [first] = memoryWrite?.allowing ?? [];

  return (call) =>
    Promise.resolve({
      decision: {
        outcome: 'allow',
        stage: 7,
        rule: first === undefined ? null : { id: first.id, revision: first.revision, others: [] },
        destinations: [],
        snapshot: call.snapshot,
      },
      sentence: null,
      ...(memoryWrite === undefined ? {} : { memoryWrite }),
    });
}
