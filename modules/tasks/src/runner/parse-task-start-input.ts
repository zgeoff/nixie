import { pickStartRunner } from './pick-start-runner';
import type { TaskRunnerRegistry, TaskStartEnvelope } from './types';

// Parses a start input with the variant of the runner it picks.
export function parseTaskStartInput(
  input: unknown,
  registry: TaskRunnerRegistry,
): TaskStartEnvelope {
  return pickStartRunner(input, registry).start.schema.parse(input);
}
