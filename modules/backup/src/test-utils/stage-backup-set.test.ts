import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { stageBackupSet } from './stage-backup-set';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it answers the manifest of the set staged through %s',
  async (entryPoint) => {
    const ctx = await setupTest();
    const manifest = await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    expect(manifest).toMatchObject({ kind: 'scheduled', sequence: 1 });
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it throws the failure itself when the set fails through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    startFaultPointFailure('backup.set.copied');

    expect(stageBackupSet(entryPoint, ctx.context, 'scheduled')).rejects.toThrow(
      'crashed at backup.set.copied',
    );
  },
);
