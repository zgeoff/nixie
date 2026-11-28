import { expect, test } from 'bun:test';
import { buildToolChangeNote } from './build-tool-change-note';

test('it builds the inbox note of a tool whose form changed', () => {
  const note = buildToolChangeNote(
    { tool: 'tracker.item_get', fromHash: 'old', toHash: 'new', cause: 'changed' },
    { definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  );

  expect(note).toStrictEqual({
    kind: 'tool_changed',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    payload: { tool: 'tracker.item_get', fromHash: 'old', toHash: 'new' },
  });
});

test.each(['allowed', 'listed', 'forgotten'] as const)(
  'it builds no note for a pin that moved by %s',
  (cause) => {
    const note = buildToolChangeNote(
      { tool: 'tracker.item_get', fromHash: 'old', toHash: 'new', cause },
      { definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
    );

    expect(note).toBeNull();
  },
);
