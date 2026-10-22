import { expect, test } from 'bun:test';
import { runHostCommands } from './run-host-commands';

test('it returns each command’s run in the order given', async () => {
  const runs = await runHostCommands('/nonexistent/config.yaml', [['memory-show'], ['memory-pin']]);

  expect(runs).toStrictEqual([
    { exitCode: 2, stdout: 'nixie memory-show takes an item ID\n' },
    { exitCode: 2, stdout: 'nixie memory-pin takes an item ID\n' },
  ]);
}, 30_000);
