import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { tasksProjections } from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { triggersProjections } from '@heynixie/triggers';
import { createPathSource } from '../definition/create-path-source';
import type { SeedResult } from '../rule/run-seed';
import { runSeed } from '../rule/run-seed';
import { runtimeTaskDefinitionsProjection } from '../runtime-task/runtime-task-definitions-projection';
import { taskDefinitionExportsProjection } from '../runtime-task/task-definition-exports-projection';
import type { DefinitionsContext } from '../runtime-task/types';
import type { DefinitionsSource } from '../types';
import { buildTestTaskSeed } from './build-test-task-seed';

export interface TestDefinitions {
  // the folder of the repo
  readonly root: string;
  readonly source: DefinitionsSource;
  readonly writer: Writer;
  readonly log: Log;
  readonly clock: TestClock;
  readonly context: DefinitionsContext;

  // the results of the seeds that a change or a resolve ran in its own transaction
  readonly seeded: SeedResult[];

  readonly readExportWakes: () => number;

  // puts a task folder in the repo, with the text of its task.yaml
  readonly writeRepoTask: (id: string, yaml: string) => Promise<void>;

  readonly removeRepoTask: (id: string) => Promise<void>;
  readonly seed: () => Promise<SeedResult>;
}

// A log that folds the records of the tasks, the triggers and the runtime task definitions, over a
// directory that serves as the definitions repo, and the context that a runtime change takes.
export async function startTestDefinitions(): Promise<TestDefinitions> {
  const base = await startTestLog();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-runtime-tasks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'tasks'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const log: Log = {
    ...base.log,
    projections: [
      ...tasksProjections,
      ...triggersProjections,
      runtimeTaskDefinitionsProjection,
      taskDefinitionExportsProjection,
    ],
  };

  const source = createPathSource({ directory: root });
  const tasks = buildTestTaskSeed();
  const seeded: SeedResult[] = [];
  const wakes = { count: 0 };
  const seed = () => runSeed({ tasks, log, source, buildPolicy });

  return {
    root,
    source,
    writer: base.writer,
    log,
    clock: base.clock,
    seeded,
    seed,
    readExportWakes: () => wakes.count,
    writeRepoTask: async (id, yaml) => {
      await mkdir(join(root, 'tasks', id), { recursive: true });
      await writeFile(join(root, 'tasks', id, 'task.yaml'), yaml);
    },
    removeRepoTask: (id) => rm(join(root, 'tasks', id), { recursive: true, force: true }),
    context: {
      log,
      checkTaskStart: tasks.checkTaskStart,
      toolNames: tasks.toolNames,
      runSeed: seed,
      inForceSeed: { log, buildPolicy },
      onSeeded: (result) => {
        seeded.push(result);
      },
      wakeExport: () => {
        wakes.count += 1;
      },
    },
  };
}

function buildPolicy() {
  return { rules: [], tools: [] };
}
