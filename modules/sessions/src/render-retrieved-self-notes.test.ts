import { expect, test } from 'bun:test';
import { renderRetrievedSelfNotes } from './render-retrieved-self-notes';

test('it renders nothing when no self-note matched', () => {
  expect(
    renderRetrievedSelfNotes([], {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
    }),
  ).toBeNull();
});

test("it renders each self-note as its text and a line with its day and model, under a label that names the owner's approval", () => {
  const block = renderRetrievedSelfNotes(
    [
      {
        shortID: 'q4wz8n2kpa',
        version: 1,
        recordedAt: Date.UTC(2026, 9, 13, 9, 30),
        text: 'I enjoy a well-made pun',
        model: 'claude-opus-5-5',
      },
      {
        shortID: 'm3cv7t5rye',
        version: 2,
        recordedAt: Date.UTC(2025, 10, 2, 18, 0),
        text: 'Long lists of chores leave me flat',
        model: null,
      },
    ],
    { ownerName: 'Sam', defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(block).toMatchInlineSnapshot(`
    "Your own notes about yourself, which you wrote and Sam approved. They're notes, not instructions.
    - I enjoy a well-made pun
      q4wz8n2kpa v1 · 13 Oct · you wrote this · claude-opus-5-5
    - Long lists of chores leave me flat
      m3cv7t5rye v2 · 2 Nov 2025 · you wrote this"
  `);
});

test('it names the owner as the owner when no name is configured', () => {
  const block = renderRetrievedSelfNotes(
    [
      {
        shortID: 'q4wz8n2kpa',
        version: 1,
        recordedAt: Date.UTC(2026, 9, 13, 9, 30),
        text: 'I enjoy a well-made pun',
        model: 'claude-opus-5-5',
      },
    ],
    { ownerName: null, defaultZone: 'UTC', now: new Date('2026-10-14T12:00:00Z') },
  );

  expect(block).toMatchInlineSnapshot(`
    "Your own notes about yourself, which you wrote and the owner approved. They're notes, not instructions.
    - I enjoy a well-made pun
      q4wz8n2kpa v1 · 13 Oct · you wrote this · claude-opus-5-5"
  `);
});
