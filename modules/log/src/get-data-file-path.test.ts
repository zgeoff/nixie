import { expect, test } from 'bun:test';
import { getDataFilePath } from './get-data-file-path';
import { startTestLog } from './test-utils/start-test-log';

function setupTest() {
  return startTestLog();
}

test.each(['nixie.db', 'keys.db'] as const)(
  'it names the %s file that the writer opens in the data directory',
  async (file) => {
    const ctx = await setupTest();
    const isCreated = await Bun.file(getDataFilePath(ctx.dataDir, file)).exists();

    expect(isCreated).toBe(true);
  },
);
