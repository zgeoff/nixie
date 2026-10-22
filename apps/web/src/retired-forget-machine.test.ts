import { expect, test } from 'bun:test';
import { initialTransition, transition } from 'xstate';
import { retiredForgetMachine } from './retired-forget-machine';
import { buildMockRetiredForgetItem } from './test-utils/build-mock-retired-forget-item';

test('it starts closed with no call', () => {
  const [snapshot] = initialTransition(retiredForgetMachine, { unfinished: null });

  expect(snapshot.value).toBe('idle');
  expect(snapshot.context.sent).toBeNull();
});

test('it starts failed with the unfinished call it was given', () => {
  const unfinished = {
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: 'item-a', version: 2 }],
  };

  const [snapshot] = initialTransition(retiredForgetMachine, { unfinished });

  expect(snapshot.value).toBe('failed');
  expect(snapshot.context.sent).toStrictEqual(unfinished);
});

test('it selects every item of the first preview, and keeps that set when a later preview arrives', () => {
  const first = buildMockRetiredForgetItem({ itemID: 'item-a' });
  const later = buildMockRetiredForgetItem({ itemID: 'item-b' });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });

  const [read] = transition(retiredForgetMachine, opened, {
    type: 'preview.read',
    items: [first],
  });

  const [reread] = transition(retiredForgetMachine, read, {
    type: 'preview.read',
    items: [later],
  });

  expect(reread.context.items).toStrictEqual([first]);
  expect([...reread.context.selected]).toStrictEqual(['item-a']);
});

test('it sends only the selected items at the versions the preview showed', () => {
  const kept = buildMockRetiredForgetItem({ itemID: 'item-a', version: 2 });
  const deleted = buildMockRetiredForgetItem({ itemID: 'item-b', version: 3 });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });

  const [read] = transition(retiredForgetMachine, opened, {
    type: 'preview.read',
    items: [kept, deleted],
  });

  const [toggled] = transition(retiredForgetMachine, read, {
    type: 'toggle',
    itemID: 'item-a',
    isChecked: false,
  });

  const [sent] = transition(retiredForgetMachine, toggled, {
    type: 'send',
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
  });

  expect(sent.value).toBe('sent');

  expect(sent.context.sent).toStrictEqual({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [{ itemID: 'item-b', version: 3 }],
  });
});

test('it stays in the confirmation when nothing is selected', () => {
  const item = buildMockRetiredForgetItem({ itemID: 'item-a' });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });
  const [read] = transition(retiredForgetMachine, opened, { type: 'preview.read', items: [item] });
  const [none] = transition(retiredForgetMachine, read, { type: 'select.none' });

  const [sent] = transition(retiredForgetMachine, none, {
    type: 'send',
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
  });

  expect(sent.value).toBe('confirming');
  expect(sent.context.sent).toBeNull();
});

test('it selects every previewed item again on select all', () => {
  const first = buildMockRetiredForgetItem({ itemID: 'item-a' });
  const second = buildMockRetiredForgetItem({ itemID: 'item-b' });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });

  const [read] = transition(retiredForgetMachine, opened, {
    type: 'preview.read',
    items: [first, second],
  });

  const [none] = transition(retiredForgetMachine, read, { type: 'select.none' });
  const [all] = transition(retiredForgetMachine, none, { type: 'select.all' });

  expect([...all.context.selected]).toStrictEqual(['item-a', 'item-b']);
});

test('it closes and drops the set when the user keeps the items', () => {
  const item = buildMockRetiredForgetItem({ itemID: 'item-a' });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });
  const [read] = transition(retiredForgetMachine, opened, { type: 'preview.read', items: [item] });
  const [cancelled] = transition(retiredForgetMachine, read, { type: 'cancel' });

  expect(cancelled.value).toBe('idle');
  expect(cancelled.context.items).toBeNull();
});

test('it closes and drops the call when the server refuses it', () => {
  const [initial] = initialTransition(retiredForgetMachine, {
    unfinished: {
      clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
      targets: [{ itemID: 'item-a', version: 2 }],
    },
  });

  const [retried] = transition(retiredForgetMachine, initial, { type: 'retry' });
  const [refused] = transition(retiredForgetMachine, retried, { type: 'refused' });

  expect(refused.value).toBe('idle');
  expect(refused.context.sent).toBeNull();
});

test('it keeps the same call through a failure and its retry', () => {
  const item = buildMockRetiredForgetItem({ itemID: 'item-a', version: 2 });
  const [initial] = initialTransition(retiredForgetMachine, { unfinished: null });
  const [opened] = transition(retiredForgetMachine, initial, { type: 'open' });
  const [read] = transition(retiredForgetMachine, opened, { type: 'preview.read', items: [item] });

  const [sent] = transition(retiredForgetMachine, read, {
    type: 'send',
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
  });

  const [failed] = transition(retiredForgetMachine, sent, { type: 'failed' });
  const [retried] = transition(retiredForgetMachine, failed, { type: 'retry' });

  expect(retried.value).toBe('sent');
  expect(retried.context.sent).toStrictEqual(sent.context.sent);
});

test('it ends done with no call once the run applies, and opens again from there', () => {
  const [initial] = initialTransition(retiredForgetMachine, {
    unfinished: {
      clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
      targets: [{ itemID: 'item-a', version: 2 }],
    },
  });

  const [retried] = transition(retiredForgetMachine, initial, { type: 'retry' });
  const [applied] = transition(retiredForgetMachine, retried, { type: 'applied' });
  const [opened] = transition(retiredForgetMachine, applied, { type: 'open' });

  expect(applied.value).toBe('done');
  expect(applied.context.sent).toBeNull();
  expect(opened.value).toBe('confirming');
});
