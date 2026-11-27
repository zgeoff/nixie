import { expect, onTestFinished, test } from 'bun:test';
import { buildAlwaysAllowRule, toolShapes } from '@heynixie/policy';
import { fillComputerLists } from './fill-computer-lists';

function setupTest() {
  // the policy's test preload installs the computer's shapes before each test, so a server that has
  // filled nothing starts with none
  toolShapes.set([]);

  onTestFinished(() => {
    toolShapes.set([]);
  });

  return {
    runFacts: {
      shortID: 'ab12',
      tool: 'computer.run',
      input: { command: 'ls -la' },
      destinations: [],
      content: [],
    },
  };
}

test('it gives the command tool an always-allow rule that pins the command when the computer is on', () => {
  const ctx = setupTest();

  fillComputerLists({ computer: {} });

  expect(buildAlwaysAllowRule(ctx.runFacts)?.form.checks).toStrictEqual([
    { arg: 'command', op: 'matches', value: expect.any(String) },
  ]);
});

test('it lists no tool shape when the computer is off', () => {
  setupTest();
  fillComputerLists({ computer: {} });
  fillComputerLists({});

  expect(toolShapes.list()).toStrictEqual([]);
});
