import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { seedCodeRunFiles } from './seed-code-run-files';

test('it stores 3 files of 2 runs and the result record of the newer run', async () => {
  await seedCodeRunFiles();

  expect({
    files: store.files.all().map((file) => [file.name, file.thread, file.sequence]),
    records: store.records.all().map((record) => [record.kind, record.sequence]),
  }).toStrictEqual({
    files: [
      ['revenue.png', 'conversation', 20],
      ['orders.csv', 'conversation', 20],
      ['beds.csv', 'k3vq8m2xpa', 10],
    ],
    records: [['tool_result', 20]],
  });
});
