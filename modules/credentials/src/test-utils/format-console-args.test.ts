import { expect, test } from 'bun:test';
import { formatConsoleArgs } from './format-console-args';

test.each([
  { call: 'an array and a string under %s%s', args: ['%s%s', ['sample-'], 'value'] },
  { call: 'an array under %s', args: ['%s', ['a', 'b']] },
  { call: 'a nested array under %s', args: ['%s', [['x', 'y'], 'z']] },
  { call: 'an object under %s', args: ['%s', { kind: 'note' }] },
  { call: 'a number and an array under %d %s', args: ['%d %s', 3, [1, 2]] },
  { call: 'an array under %o', args: ['%o', ['a']] },
  { call: 'an array under %j', args: ['%j', ['a']] },
  { call: 'a literal percent sign', args: ['100%% of %s', 'notes'] },
  { call: 'a directive with no argument left', args: ['%s and %s', 'one'] },
  { call: 'an array after a plain string', args: ['notes', ['a', 'b']] },
  { call: 'a nested object after a plain string', args: ['failed', { detail: { field: 'x' } }] },
  { call: 'an array as the first argument', args: [['a', 'b'], 'c'] },
])('it formats $call as Bun’s console prints it', async (row) => {
  const child = Bun.spawn(
    [process.execPath, '-e', 'console.log(...JSON.parse(process.env.CONSOLE_ARGS ?? "[]"))'],
    {
      env: { ...process.env, CONSOLE_ARGS: JSON.stringify(row.args), NO_COLOR: '1' },
      stdout: 'pipe',
    },
  );

  const printed = await new Response(child.stdout).text();

  await child.exited;

  expect(`${formatConsoleArgs(row.args)}\n`).toBe(printed);
});
