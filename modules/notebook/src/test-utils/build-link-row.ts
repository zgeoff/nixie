import type { LinkRow } from '../types';

export function buildLinkRow(overrides: Partial<LinkRow>): LinkRow {
  return {
    link_key: 'k',
    from_note_id: 'note-a',
    target_kind: 'memory',
    target_id: 'item-1',
    type: 'cites',
    reason_seq: null,
    created_at: 1,
    ...overrides,
  };
}
