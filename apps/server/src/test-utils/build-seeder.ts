import { buildIdentitySeeder } from '@heynixie/api/test-utils';
import type { IdentitySeederDeps } from '@heynixie/api/test-utils';
import { systemClock } from '@heynixie/clock';
import { buildConnectorSeeder } from '@heynixie/connectors/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { seedHeldTasks } from './seed-held-tasks';
import { seedRuleConflict } from './seed-rule-conflict';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export type TestDeps = IdentitySeederDeps;

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildTaskSeeder(deps),
    ...buildConnectorSeeder({ log: deps.context.log }),
    ...buildIdentitySeeder(deps),
  };
}

type DataFiles = Pick<BootFiles, 'dataDir' | 'deploymentKey'>;

export type BootSeederFiles = DataFiles & Pick<BootFiles, 'configPath'>;

// Binds the seeds of a stopped nixie to its boot files: each one opens the data directory, so no
// nixie may hold the data's writer lock.
export function buildBootSeeder(files: BootSeederFiles) {
  return {
    heldTasks: () => seedHeldTasks(files),
    ruleConflict: () => seedRuleConflict(files),
    driftedTask: (taskID: string) =>
      runInDataLog(files, (context) => buildTaskSeeder({ context }).driftedTask(taskID)),
    goneHolderLease: (taskID: string) =>
      runInDataLog(files, (context) => buildTaskSeeder({ context }).goneHolderLease(taskID)),
  };
}

export type BootSeeder = ReturnType<typeof buildBootSeeder>;

async function runInDataLog(
  files: DataFiles,
  run: (context: TasksContext) => Promise<void>,
): Promise<void> {
  const testLog = await startDataLog({ ...files, clock: systemClock });

  try {
    await run(testLog.context);
  } finally {
    await testLog.writer.stop();
  }
}
