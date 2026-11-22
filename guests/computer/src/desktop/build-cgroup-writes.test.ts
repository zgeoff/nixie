import { expect, test } from 'bun:test';
import { buildCgroupWrites } from './build-cgroup-writes';
import { terminalMemoryLimitBytes } from './constants';

test('it limits the terminal and every command to 512 MiB together, with no swap', () => {
  expect(buildCgroupWrites(terminalMemoryLimitBytes)).toStrictEqual([
    { file: 'memory.max', value: '536870912' },
    { file: 'memory.swap.max', value: '0' },
    { file: 'memory.oom.group', value: '1' },
  ]);
});
