import { expect, test } from 'bun:test';
import { buildGuestCommand } from './build-guest-command';

test("it runs the harness guest's entry file from the image", () => {
  expect(
    buildGuestCommand(
      { id: 'imp' },
      { package: 'example', entries: { turn: 'run-turn', check: 'run-check' } },
      'check',
    ),
  ).toStrictEqual({
    argv: ['bun', '/app/guests/example/src/run-check.ts'],
    env: { HOME: '/home/nixie' },
  });
});

test("it runs the harness guest's entry file from the checkout on the process sandbox", () => {
  expect(
    buildGuestCommand(
      { id: 'process' },
      { package: 'example', entries: { turn: 'run-turn', check: null } },
    ),
  ).toStrictEqual({
    argv: [process.execPath, expect.toEndWith('/guests/example/src/run-turn.ts')],
    env: {},
  });
});

test('it throws for an entry the guest lacks', () => {
  expect(() =>
    buildGuestCommand(
      { id: 'imp' },
      { package: 'example', entries: { turn: 'run-turn', check: null } },
      'check',
    ),
  ).toThrow('the example guest has no check entry');
});
