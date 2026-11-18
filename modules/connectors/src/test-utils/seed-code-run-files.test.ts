import { expect, test } from 'bun:test';
import { readCodeFile } from '../code/read-code-file';
import { seedCodeRunFiles } from './seed-code-run-files';
import { startTestLog } from './start-test-log';

test('it seeds the files of a run that its thread reads back', async () => {
  const log = await startTestLog();

  const seeded = await seedCodeRunFiles(log, {
    thread: 'conversation',
    writes: { 'out/orders.csv': 'a,b\n' },
  });

  const [file] = seeded.files;

  const read = await readCodeFile(log, {
    thread: 'conversation',
    fileID: file?.file ?? 'missing',
  });

  expect({ paths: seeded.files.map((entry) => entry.path), read }).toStrictEqual({
    paths: ['out/orders.csv'],
    read: { kind: 'ok', bytes: new TextEncoder().encode('a,b\n') },
  });
});
