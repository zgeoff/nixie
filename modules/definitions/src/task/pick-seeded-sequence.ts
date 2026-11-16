export interface SeededTask {
  readonly id: string;
  readonly hash: string;
}

export interface SeededTasks {
  readonly recordSequence: number;
  readonly tasks: readonly SeededTask[];
}

// The sequence of the seed that put the hash in force: the oldest seed of the newest unbroken run of
// seeds that hold it. The seeds come newest first. A run that reaches the end of the list names its
// oldest seed.
export function pickSeededSequence(
  seeds: readonly SeededTasks[],
  definitionID: string,
  hash: string,
): number | null {
  let sequence: number | null = null;

  for (const seed of seeds) {
    const holds = seed.tasks.some((task) => task.id === definitionID && task.hash === hash);

    if (!holds) {
      break;
    }

    sequence = seed.recordSequence;
  }

  return sequence;
}
