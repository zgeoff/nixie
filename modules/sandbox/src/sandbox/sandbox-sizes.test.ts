import { expect, test } from 'bun:test';
import { sandboxSizes } from './sandbox-sizes';

test('it holds the conversation row', () => {
  expect(sandboxSizes.conversation).toStrictEqual({ vcpus: 2, memoryMiB: 512, diskMiB: 4096 });
});

test('it holds the system task row', () => {
  expect(sandboxSizes.systemTask).toStrictEqual({ vcpus: 1, memoryMiB: 384, diskMiB: 4096 });
});

test('it holds the fetch row', () => {
  expect(sandboxSizes.fetch).toStrictEqual({ vcpus: 1, memoryMiB: 192, diskMiB: 4096 });
});

test('it gives every row an even memory figure of 128 MiB or more', () => {
  const rows = Object.values(sandboxSizes);

  expect(rows).toSatisfyAll((row) => row.memoryMiB % 2 === 0 && row.memoryMiB >= 128);
});

test('it refuses a memory figure that is odd or under 128 MiB', () => {
  const rows = [{ memoryMiB: 193 }, { memoryMiB: 64 }];

  expect(rows).toSatisfyAll((row) => !(row.memoryMiB % 2 === 0 && row.memoryMiB >= 128));
});
