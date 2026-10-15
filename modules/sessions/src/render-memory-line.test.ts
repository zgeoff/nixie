import { expect, test } from 'bun:test';
import { renderMemoryLine } from './render-memory-line';

test('it renders the target example for an approved note-taker item from a pasted page', () => {
  expect(
    renderMemoryLine(
      {
        shortID: 'b7kq2m9xza',
        version: 3,
        recordedAt: Date.UTC(2025, 9, 13, 9, 30),
        origin: 'memory_writer',
        source: 'untrusted',
        approval: { isQuotePasted: true },
      },
      { ownerName: 'Robin', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
    ),
  ).toBe(
    'b7kq2m9xza v3 · 13 Oct 2025 · the note-taker noted it · from a pasted page · Robin approved',
  );
});

test.each([
  [{ origin: 'conversation', source: 'owner', approval: null }, 'you noted it · Robin said this'],
  [{ origin: 'conversation', source: 'untrusted', approval: null }, 'you noted it · unconfirmed'],
  [
    { origin: 'conversation', source: 'untrusted', approval: { isQuotePasted: false } },
    'you noted it · unconfirmed · Robin approved',
  ],
  [
    { origin: 'conversation', source: 'untrusted', approval: { isQuotePasted: true } },
    'you noted it · from a pasted page · Robin approved',
  ],
  [
    { origin: 'memory_writer', source: 'owner', approval: null },
    'the note-taker noted it · Robin said this',
  ],
  [
    { origin: 'memory_writer', source: 'untrusted', approval: null },
    'the note-taker noted it · unconfirmed',
  ],
  [
    { origin: 'memory_writer', source: 'untrusted', approval: { isQuotePasted: false } },
    'the note-taker noted it · unconfirmed · Robin approved',
  ],
  [
    { origin: 'memory_writer', source: 'untrusted', approval: { isQuotePasted: true } },
    'the note-taker noted it · from a pasted page · Robin approved',
  ],
  [
    { origin: 'task', source: 'owner', approval: { isQuotePasted: false } },
    'a task noted it · Robin said this · Robin approved',
  ],
  [
    { origin: 'task', source: 'untrusted', approval: { isQuotePasted: false } },
    'a task noted it · unconfirmed · Robin approved',
  ],
  [{ origin: 'owner', source: 'owner', approval: null }, 'Robin said this'],
  [
    { origin: 'owner', source: 'owner', approval: { isQuotePasted: false } },
    'Robin said this · Robin approved',
  ],
  [
    { origin: 'conversation', source: 'owner_data', approval: null },
    "you noted it · from Robin's data",
  ],
] as const)('it says an item with provenance %o reads %s', (provenance, words) => {
  expect(
    renderMemoryLine(
      {
        shortID: 'h4ns8w1cpe',
        version: 2,
        recordedAt: Date.parse('2026-10-13T09:30:00Z'),
        ...provenance,
      },
      { ownerName: 'Robin', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
    ),
  ).toBe(`h4ns8w1cpe v2 · 13 Oct · ${words}`);
});

test('it names the owner as the owner when no name is set', () => {
  expect(
    renderMemoryLine(
      {
        shortID: 'h4ns8w1cpe',
        version: 2,
        recordedAt: Date.UTC(2026, 9, 13, 9, 30),
        origin: 'memory_writer',
        source: 'owner',
        approval: { isQuotePasted: false },
      },
      { ownerName: null, defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
    ),
  ).toBe(
    'h4ns8w1cpe v2 · 13 Oct · the note-taker noted it · the owner said this · the owner approved',
  );
});

test('it names the version that replaced a past version last', () => {
  expect(
    renderMemoryLine(
      {
        shortID: 'h4ns8w1cpe',
        version: 4,
        recordedAt: Date.UTC(2026, 2, 2, 9, 30),
        origin: 'conversation',
        source: 'owner',
        approval: null,
      },
      { ownerName: 'Robin', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
      { ref: 'h4ns8w1cpe v5', isRetirement: false },
    ),
  ).toBe('h4ns8w1cpe v4 · 2 Mar · you noted it · Robin said this · replaced by h4ns8w1cpe v5');
});

test('it names the version that retired a past version last as a retirement', () => {
  expect(
    renderMemoryLine(
      {
        shortID: 'h4ns8w1cpe',
        version: 4,
        recordedAt: Date.parse('2026-03-02T09:30:00Z'),
        origin: 'conversation',
        source: 'owner',
        approval: null,
      },
      { ownerName: 'Robin', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
      { ref: 'h4ns8w1cpe v5', isRetirement: true },
    ),
  ).toBe('h4ns8w1cpe v4 · 2 Mar · you noted it · Robin said this · retired in h4ns8w1cpe v5');
});
