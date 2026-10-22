import { expect, test } from 'bun:test';
import { pickNoticeEntryStatus } from './pick-notice-entry-status';
import { buildMockMemoryNoticeEntry } from './test-utils/build-mock-memory-notice-entry';

test('it offers the changes for an item still at the version written', () => {
  expect(pickNoticeEntryStatus(buildMockMemoryNoticeEntry())).toBe('open');
});

test('it reads an item you kept at the version written as kept', () => {
  expect(pickNoticeEntryStatus(buildMockMemoryNoticeEntry({ isKept: true }))).toBe('kept');
});

test('it reads an item whose newest version is an undo as undone', () => {
  const entry = buildMockMemoryNoticeEntry({
    item: { change: 'undone', state: 'retired', version: 2 },
  });

  expect(pickNoticeEntryStatus(entry)).toBe('undone');
});

test('it reads an item retired after the notice as retired', () => {
  const entry = buildMockMemoryNoticeEntry({
    item: { change: 'retired', state: 'retired', version: 2 },
  });

  expect(pickNoticeEntryStatus(entry)).toBe('retired');
});

test('it reads an item edited after the notice as changed', () => {
  const entry = buildMockMemoryNoticeEntry({
    isKept: true,
    item: { change: 'edited', version: 2 },
  });

  expect(pickNoticeEntryStatus(entry)).toBe('changed');
});

test('it reads a proposal as proposed', () => {
  const entry = buildMockMemoryNoticeEntry({ change: 'proposed', item: null, version: null });

  expect(pickNoticeEntryStatus(entry)).toBe('proposed');
});

test('it reads an item that is gone as gone', () => {
  expect(pickNoticeEntryStatus(buildMockMemoryNoticeEntry({ item: null }))).toBe('gone');
});

test('it reads an item being forgotten as gone', () => {
  const entry = buildMockMemoryNoticeEntry({ item: { state: 'forgetting' } });

  expect(pickNoticeEntryStatus(entry)).toBe('gone');
});
