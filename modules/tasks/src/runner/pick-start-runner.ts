import { z } from 'zod';
import type { StartableRunner, TaskRunnerRegistry } from './types';

const runnerChoiceSchema = z.looseObject({ runner: z.string().optional() });

// The runner whose variant a start input picks: the one its `runner` key names, and the default
// runner when it names none.
export function pickStartRunner(input: unknown, registry: TaskRunnerRegistry): StartableRunner {
  const key = runnerChoiceSchema.parse(input).runner ?? registry.defaultRunner.key;
  const runner = registry.startable.find((candidate) => candidate.key === key);

  if (runner === undefined) {
    throw new Error(`no task runner starts with the key ${key}`);
  }

  return runner;
}
