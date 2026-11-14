import type { MomentRow } from '@heynixie/memory';
import invariant from 'tiny-invariant';

export function toContractMomentSummary(row: MomentRow, title: string | null) {
  const state = row.state;

  invariant(
    state === 'active' || state === 'retired',
    'the store returned a moment that is being destroyed',
  );

  return {
    editedAt: row.edited_at === null ? null : new Date(row.edited_at),
    keptAt: new Date(row.kept_at),
    keptBy: row.kept_by,
    momentID: row.moment_id,
    shortID: row.short_id,
    state,
    title,
  };
}
