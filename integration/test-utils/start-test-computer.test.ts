import { expect, test } from 'bun:test';
import { toolShapes } from '@heynixie/policy';
import { inboxKinds } from '@heynixie/tasks';
import { startTestComputer } from './start-test-computer';

test('it fills the core lists of the computer when the API starts', async () => {
  await startTestComputer();

  expect({
    inbox: inboxKinds.byKind('computer.takeover_started') !== null,
    shapes: toolShapes.list().length > 0,
  }).toStrictEqual({ inbox: true, shapes: true });
});
