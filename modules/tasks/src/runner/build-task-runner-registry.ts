import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import { readStartedTaskIDs } from '../task/read-started-task-ids';
import type { RunStep, TasksContext, TasksTables } from '../types';
import type {
  BoundStep,
  StartableRunner,
  TaskRunnerDefinition,
  TaskRunnerRegistry,
  TaskRunnerResolution,
} from './types';

export interface TaskRunnerRegistryOptions {
  readonly definitions: readonly TaskRunnerDefinition[];

  // runs a started task whose record names no runner
  readonly defaultRunner: TaskRunnerDefinition;
}

type ResolveContext = Pick<TasksContext, 'log'>;

type ResolveTask = (context: ResolveContext, taskID: string) => Promise<TaskRunnerResolution>;

export function buildTaskRunnerRegistry(options: TaskRunnerRegistryOptions): TaskRunnerRegistry {
  assertDefinitions(options);

  const definitions = options.definitions;
  const defaultRunner = options.defaultRunner;

  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

  const byFixedTask = new Map(
    definitions.flatMap((definition) =>
      definition.fixedTasks.map((taskID) => [taskID, definition] as const),
    ),
  );

  const resolve: ResolveTask = async (context, taskID) => {
    const fixed = byFixedTask.get(taskID);

    if (fixed !== undefined) {
      return { status: 'found', definition: fixed };
    }

    const row = await context.log.writer.db
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['started_by', 'created_sequence', 'definition_id'])
      .where('task_id', '=', taskID)
      .executeTakeFirst();

    if (row === undefined) {
      return { status: 'none' };
    }

    const key = await readStoredRunner(context, row.created_sequence);

    if (key !== null) {
      const named = byKey.get(key);

      return named === undefined
        ? { status: 'unknown', key }
        : { status: 'found', definition: named };
    }

    return row.started_by === null && row.definition_id === null
      ? { status: 'none' }
      : { status: 'found', definition: defaultRunner };
  };

  return {
    startable: definitions.filter((definition) => isStartable(definition)),
    defaultRunner,
    resolve,
    readKeptSandboxOwners: async (context) => {
      const fixed = definitions
        .filter((definition) => definition.keepsSandboxes)
        .flatMap((definition) => definition.fixedTasks);

      const open = await readStartedTaskIDs(context, { end: 'open' });

      const resolutions = await Promise.all(
        open.map(async (taskID) => ({ taskID, resolution: await resolve(context, taskID) })),
      );

      const kept = resolutions
        .filter((entry) => isKeptResolution(entry.resolution))
        .map((entry) => entry.taskID);

      return [...fixed, ...kept];
    },
    bindSteps: (context, bound, fallback) =>
      bindSteps({ context, definitions, resolve }, bound, fallback),
  };
}

function assertDefinitions(options: TaskRunnerRegistryOptions): void {
  const keys = new Set<string>();
  const fixedTasks = new Set<string>();

  for (const definition of options.definitions) {
    if (keys.has(definition.key)) {
      throw new Error(`two task runners share the key ${definition.key}`);
    }

    keys.add(definition.key);

    for (const taskID of definition.fixedTasks) {
      if (fixedTasks.has(taskID)) {
        throw new Error(`two task runners share the fixed task ${taskID}`);
      }

      fixedTasks.add(taskID);
    }
  }

  if (!keys.has(options.defaultRunner.key)) {
    throw new Error(
      `the default task runner ${options.defaultRunner.key} is not in the definitions`,
    );
  }
}

async function readStoredRunner(
  context: ResolveContext,
  createdSequence: number,
): Promise<string | null> {
  const [created] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [createdSequence],
  });

  return created === undefined
    ? null
    : (taskCreatedCodec.tryDecodePartial(created.record.payload)?.runner ?? null);
}

function isStartable(definition: TaskRunnerDefinition): definition is StartableRunner {
  return definition.start !== null;
}

function isKeptResolution(resolution: TaskRunnerResolution): boolean {
  return resolution.status === 'found' && resolution.definition.keepsSandboxes;
}

interface BindContext {
  readonly context: ResolveContext;
  readonly definitions: readonly TaskRunnerDefinition[];
  readonly resolve: ResolveTask;
}

function bindSteps(bind: BindContext, bound: readonly BoundStep[], fallback: RunStep): RunStep {
  const steps = new Map<string, RunStep>();

  for (const entry of bound) {
    const key = entry.definition.key;

    if (!bind.definitions.some((definition) => definition.key === key)) {
      throw new Error(`a step is bound to the task runner ${key}, which has no definition`);
    }

    if (steps.has(key)) {
      throw new Error(`the task runner ${key} has two steps`);
    }

    steps.set(key, entry.runStep);
  }

  for (const definition of bind.definitions) {
    if (!steps.has(definition.key)) {
      throw new Error(`the task runner ${definition.key} has no step`);
    }
  }

  return async (input) => {
    const resolution = await bind.resolve(bind.context, input.taskID);

    return match(resolution)
      .with({ status: 'found' }, (found) => {
        const step = steps.get(found.definition.key);

        invariant(step, `the task runner ${found.definition.key} has a bound step`);

        return step(input);
      })
      .with({ status: 'unknown' }, (unknown) => {
        throw new Error(
          `the task ${input.taskID} names the runner ${unknown.key}, which has no definition`,
        );
      })
      .with({ status: 'none' }, () => fallback(input))
      .exhaustive();
  };
}
