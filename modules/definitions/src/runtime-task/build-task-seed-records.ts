import type { Definitions, RecordInput } from '@heynixie/log';
import type { TaskSeedPlan } from '../utils/build-task-seed-plan';
import { definitionRepoMovedCodec } from './definition-repo-moved-codec';
import { definitionSettledCodec } from './definition-settled-codec';

// The records a seed writes for the runtime changes it settles or finds moved
export function buildTaskSeedRecords(
  plan: TaskSeedPlan,
  definitions: Definitions,
): readonly RecordInput[] {
  return [
    ...plan.adopted.map((change) => ({
      kind: definitionSettledCodec.kind,
      definitions,
      payload: definitionSettledCodec.encode({
        changeID: change.changeID,
        definitionID: change.definitionID,
        outcome: 'adopted',
        cause: 'seed',
        hash: change.hash,
      }),
    })),
    ...plan.moved.map((moved) => ({
      kind: definitionRepoMovedCodec.kind,
      definitions,
      payload: definitionRepoMovedCodec.encode({
        changeID: moved.change.changeID,
        definitionID: moved.change.definitionID,
        definitions: moved.definitions,
      }),
    })),
  ];
}
