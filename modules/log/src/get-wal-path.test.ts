import { expect, test } from 'bun:test';
import { getDataFilePath } from './get-data-file-path';
import { getWALPath } from './get-wal-path';
import { startTestLog } from './test-utils/start-test-log';

function setupTest() {
  return startTestLog();
}

test.each(['nixie.db', 'keys.db'] as const)(
  'it names the write-ahead log file that SQLite keeps beside %s',
  async (file) => {
    const ctx = await setupTest();

    const header = await Bun.file(getWALPath(getDataFilePath(ctx.dataDir, file)))
      .slice(0, 4)
      .arrayBuffer();

    // SQLite starts a WAL file with one of these magic numbers, and a database file with the text
    // "SQLite format 3", so the header tells the WAL from the database it belongs to.
    expect(new DataView(header).getUint32(0)).toBeOneOf([0x37_7f_06_82, 0x37_7f_06_83]);
  },
);
