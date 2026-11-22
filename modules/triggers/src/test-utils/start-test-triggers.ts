import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import {
  readDefinitionTaskInTransaction,
  tasksProjections,
  withdrawDefinitionTaskInTransaction,
} from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { createFakeClock } from '@zgeoff/testing/clock';
import { triggersProjections } from '../projection/triggers-projections';
import type { TriggerCoreContext } from '../types';

export interface TestTriggers {
  readonly writer: Writer;
  readonly clock: FakeClock;

  // the tasks module's context, on a log that folds the trigger records too
  readonly context: TasksContext;
  readonly core: TriggerCoreContext;
  readonly definitionStore: ReturnType<typeof buildTestDefinitionStore>;

  // each event that the core logged, such as a change of a source's health
  readonly logged: { readonly event: string; readonly fields: unknown }[];
}

// A log on a test clock that holds the log, tasks and triggers projections, and the core on top.
// The writer's clock is the test clock, so a record's time is the time of the test.
export async function startTestTriggers(): Promise<TestTriggers> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-triggers-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = createFakeClock({ startMs: Date.parse('2027-03-09T00:00:00Z') });

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [...logProjections, ...tasksProjections, ...triggersProjections],
  };

  const definitionStore = buildTestDefinitionStore();

  const context: TasksContext = {
    log,
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    runSettings: buildTestRunSettings(),
    runners: buildTestTaskRunners(),
    readDefinitionVersion: definitionStore.readDefinitionVersion,
    readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    readDefinitionNextFire: definitionStore.readDefinitionNextFire,
  };

  const logged: { event: string; fields: unknown }[] = [];

  return {
    writer,
    clock,
    context,
    definitionStore,
    logged,
    core: {
      log,
      clock,
      definitions: context.definitions,
      logEvent: (event, fields) => {
        logged.push({ event, fields });
      },
      readDefinitionTask: readDefinitionTaskInTransaction,
      retireOneShot: (tx, definitionID) =>
        withdrawDefinitionTaskInTransaction(tx, context, definitionID),
    },
  };
}
