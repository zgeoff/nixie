import type { RepoTask, SnapshotTask, SnapshotTasks } from '../types';
import { buildRuntimeOverlay } from './build-runtime-overlay';

// The part of a runtime change in force that the seed reads
export interface RuntimeTaskChange {
  readonly changeID: string;
  readonly definitionID: string;

  // the version the change holds; null for an undefine
  readonly hash: string | null;

  readonly base: string | null;

  // the repo's version when the row last read it
  readonly definitions: string | null;
}

export interface TaskSeedInput {
  readonly repo: readonly RepoTask[];
  readonly runtime: readonly RuntimeTaskChange[];

  // the hashes among the changes' own that a version body is readable for
  readonly readable: ReadonlySet<string>;
}

export interface OverlaidTaskDefinition {
  readonly definitionID: string;

  // null when a runtime change in force removes the definition
  readonly hash: string | null;
  readonly origin: 'definitions' | 'nixie';
  readonly changeID: string | null;

  // the key of the change's version is lost, so the definition stays out of force
  readonly isUnreadable: boolean;
}

export interface RepoMovedChange {
  readonly change: RuntimeTaskChange;
  readonly definitions: string | null;
}

export interface TaskSeedPlan {
  // every definition the layer touches or the repo holds, in order of ID
  readonly definitions: readonly OverlaidTaskDefinition[];

  // the tasks in force, for the snapshot
  readonly tasks: SnapshotTasks;

  readonly adopted: readonly RuntimeTaskChange[];
  readonly moved: readonly RepoMovedChange[];
  readonly stays: readonly RuntimeTaskChange[];
}

// Lays the runtime changes in force over the repo's task list. A change whose hash the repo holds
// is adopted, and one whose base the repo no longer holds stays in force over it.
export function buildTaskSeedPlan(input: TaskSeedInput): TaskSeedPlan {
  const overlay = buildRuntimeOverlay({
    seeded: input.repo.map((task) => ({ key: task.id, hash: task.hash, value: task })),
    changes: input.runtime.map((change) => ({
      key: change.definitionID,
      hash: change.hash,
      value: change,
    })),
  });

  const layered = new Map<string, OverlaidTaskDefinition>(
    input.repo.map((task) => [
      task.id,
      {
        definitionID: task.id,
        hash: task.hash,
        origin: 'definitions',
        changeID: null,
        isUnreadable: false,
      },
    ]),
  );

  const moved: RepoMovedChange[] = [];

  for (const overlaid of overlay.inForce) {
    const change = overlaid.change;
    const repoHash = overlaid.beneath?.hash ?? null;

    layered.set(change.definitionID, buildLayeredDefinition(change, input.readable));

    if (repoHash !== change.definitions) {
      moved.push({ change, definitions: repoHash });
    }
  }

  const definitions = [...layered.values()].toSorted((left, right) =>
    left.definitionID < right.definitionID ? -1 : 1,
  );

  return {
    definitions,
    tasks: definitions.flatMap((definition) => toSnapshotTask(definition)),
    adopted: overlay.adopted,
    moved,
    stays: overlay.inForce.map((overlaid) => overlaid.change),
  };
}

function buildLayeredDefinition(
  change: RuntimeTaskChange,
  readable: ReadonlySet<string>,
): OverlaidTaskDefinition {
  return {
    definitionID: change.definitionID,
    hash: change.hash,
    origin: 'nixie',
    changeID: change.changeID,
    isUnreadable: change.hash !== null && !readable.has(change.hash),
  };
}

function toSnapshotTask(definition: OverlaidTaskDefinition): readonly SnapshotTask[] {
  if (definition.hash === null || definition.isUnreadable) {
    return [];
  }

  if (definition.origin === 'nixie' && definition.changeID !== null) {
    return [
      {
        id: definition.definitionID,
        hash: definition.hash,
        origin: 'nixie',
        changeID: definition.changeID,
      },
    ];
  }

  return [{ id: definition.definitionID, hash: definition.hash, origin: 'definitions' }];
}
