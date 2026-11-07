import type { MomentRow } from '../read-moment-row';

export function buildMockMomentRow(overrides: Partial<MomentRow> = {}): MomentRow {
  return {
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
    ...overrides,
  };
}
