import { expect, test } from 'bun:test';
import { toContractMomentSummary } from './to-contract-moment-summary';

test('it carries the IDs, the state, the keeper and the dates of a moment', () => {
  expect(
    toContractMomentSummary(
      {
        moment_id: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
        short_id: 'q4n8v2hw6t',
        thread: 'conversation',
        first_sequence: 3,
        last_sequence: 9,
        state: 'retired',
        version: 3,
        kept_by: 'model',
        kept_thread: 'conversation',
        kept_model: 'claude-test-4',
        kept_at: Date.parse('2026-10-10T12:00:00Z'),
        kept_sequence: 10,
        title_sequence: 10,
        note_sequence: null,
        edited_at: Date.parse('2026-10-11T08:30:00Z'),
        updated_sequence: 12,
      },
      'The ladder on the stairs',
    ),
  ).toStrictEqual({
    editedAt: new Date('2026-10-11T08:30:00Z'),
    keptAt: new Date('2026-10-10T12:00:00Z'),
    keptBy: 'model',
    momentID: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
    shortID: 'q4n8v2hw6t',
    state: 'retired',
    title: 'The ladder on the stairs',
  });
});

test('it carries no edit date for a moment never edited', () => {
  expect(
    toContractMomentSummary(
      {
        moment_id: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
        short_id: 'q4n8v2hw6t',
        thread: 'conversation',
        first_sequence: 3,
        last_sequence: 9,
        state: 'active',
        version: 1,
        kept_by: 'owner',
        kept_thread: null,
        kept_model: null,
        kept_at: Date.parse('2026-10-10T12:00:00Z'),
        kept_sequence: 10,
        title_sequence: 10,
        note_sequence: null,
        edited_at: null,
        updated_sequence: 10,
      },
      null,
    ).editedAt,
  ).toBeNull();
});
