import { expect, test } from 'bun:test';
import { buildMockMomentRow } from './build-mock-moment-row';

test('it builds an active moment kept by the user', () => {
  expect(buildMockMomentRow()).toStrictEqual({
    moment_id: 'moment-1',
    short_id: 'm1',
    thread: 'conversation',
    first_sequence: 1,
    last_sequence: 1,
    state: 'active',
    version: 1,
    kept_by: 'owner',
    kept_thread: null,
    kept_model: null,
    kept_at: 0,
    kept_sequence: 2,
    title_sequence: 2,
    note_sequence: null,
    edited_at: null,
    updated_sequence: 2,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockMomentRow({ moment_id: 'moment-7', state: 'retired' })).toStrictEqual({
    moment_id: 'moment-7',
    short_id: 'm1',
    thread: 'conversation',
    first_sequence: 1,
    last_sequence: 1,
    state: 'retired',
    version: 1,
    kept_by: 'owner',
    kept_thread: null,
    kept_model: null,
    kept_at: 0,
    kept_sequence: 2,
    title_sequence: 2,
    note_sequence: null,
    edited_at: null,
    updated_sequence: 2,
  });
});
