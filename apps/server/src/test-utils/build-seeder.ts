import { buildIdentitySeeder } from '@heynixie/api/test-utils';
import type { IdentitySeederDeps } from '@heynixie/api/test-utils';
import { systemClock } from '@heynixie/clock';
import { buildConnectorSeeder } from '@heynixie/connectors/test-utils';
import { writeRecords } from '@heynixie/log';
import { readTestRecordRows } from '@heynixie/log/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import type { BegunPurgeOptions } from './seed-begun-purge';
import { seedBegunPurge } from './seed-begun-purge';
import { seedDefinitionConflict } from './seed-definition-conflict';
import { seedHeldTasks } from './seed-held-tasks';
import { seedOpenHandover } from './seed-open-handover';
import { seedOpenTakeover } from './seed-open-takeover';
import { seedRuleConflict } from './seed-rule-conflict';
import { seedUncheckedRuleApprovals } from './seed-unchecked-rule-approvals';
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
    begunPurge: (options?: BegunPurgeOptions) => seedBegunPurge(files, options),
    heldTasks: () => seedHeldTasks(files),
    openHandover: () => seedOpenHandover(files),
    openTakeover: () => seedOpenTakeover(files),
    ruleConflict: () => seedRuleConflict(files),
    uncheckedRuleApprovals: () => seedUncheckedRuleApprovals(files),
    definitionConflict: () => seedDefinitionConflict(files),
    driftedTask: (taskID: string) =>
      runInDataLog(files, (context) => buildTaskSeeder({ context }).driftedTask(taskID)),
    strayReply: (taskID: string, runID = `${taskID}:9@1`) =>
      runInDataLog(files, async (context) => {
        await writeRecords(context.log, [
          {
            kind: 'model.reply',
            definitions: { snapshotHash: 'sha256:test' },
            thread: taskID,
            payload: { messageID: 'msg-stray', runID },
            erasable: { text: 'A reply no step kept.' },
          },
        ]);
      }),

    // a call of the code tool, whose forget destroys the sandbox that the call's ID owns, then
    // erases the record key that seals the call's input; returns the call record's sequence and
    // that key's ID
    codeCall: (thread: string, callID: string) =>
      runInDataLog(files, async (context) => {
        const [call] = await writeRecords(context.log, [
          {
            kind: 'tool_called',
            definitions: { snapshotHash: 'sha256:test' },
            thread,
            payload: { callID, runID: `${thread}:1@1`, toolUseID: null, tool: 'code.run' },
            erasable: { input: { code: "print('plum')" } },
          },
        ]);

        invariant(call !== undefined, 'the call record was written');

        const rows = await readTestRecordRows(context.log.writer);

        const keyID = rows.find((row) => row.sequence === call.sequence)?.key_id;

        invariant(typeof keyID === 'string', 'the call record is sealed under a record key');

        return { sequence: call.sequence, keyID };
      }),
    goneHolderLease: (taskID: string) =>
      runInDataLog(files, (context) => buildTaskSeeder({ context }).goneHolderLease(taskID)),
  };
}

export type BootSeeder = ReturnType<typeof buildBootSeeder>;

async function runInDataLog<Result>(
  files: DataFiles,
  run: (context: TasksContext) => Promise<Result>,
): Promise<Result> {
  const testLog = await startDataLog({ ...files, clock: systemClock });

  try {
    return await run(testLog.context);
  } finally {
    await testLog.writer.stop();
  }
}
