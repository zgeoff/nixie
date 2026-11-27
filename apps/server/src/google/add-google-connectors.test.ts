import { expect, test } from 'bun:test';
import { addGoogleConnectors } from './add-google-connectors';

function setupTest() {
  const actions = {
    connectors: new Map(),
    readHeldToolPrefixes: () => ['computer.'],
  };

  return { actions };
}

test('it holds every Google tool in the queue, beside the tools that are already held, when google is off', () => {
  const ctx = setupTest();
  const added = addGoogleConnectors(ctx.actions, null);

  expect(added.readHeldToolPrefixes?.()).toStrictEqual([
    'computer.',
    'gmail.',
    'calendar.',
    'drive.',
  ]);
});

test('it holds no Google tool in the queue when google is on', () => {
  const ctx = setupTest();
  const added = addGoogleConnectors(ctx.actions, []);

  expect(added.readHeldToolPrefixes?.()).toStrictEqual(['computer.']);
});
