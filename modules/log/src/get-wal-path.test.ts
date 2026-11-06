import { expect, test } from 'bun:test';
import { getDataFilePath } from './get-data-file-path';
import { getWALPath } from './get-wal-path';
import { startTestLog } from './test-utils/start-test-log';

function setupTest() {
  return startTestLog();
}

test.each(['nixie.db', 'keys.db'] as const)(
  'it names the WAL file that holds the commits of %s not yet checkpointed',
  async (file) => {
    const ctx = await setupTest();

    const wal = Bun.file(getWALPath(getDataFilePath(ctx.dataDir, file)));

    expect(wal.size).toBeGreaterThan(0);
  },
);
