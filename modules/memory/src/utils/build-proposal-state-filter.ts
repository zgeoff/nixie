import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

export interface ProposalStateFilter {
  readonly state: 'open' | 'closed' | 'declined';

  // an open proposal counts only while its lapse lies ahead of this time, when it is given
  readonly nowMs?: number;
}

// A where clause on the shared row of a memory proposal, which holds its state and its lapse.
export function buildProposalStateFilter(
  filter: ProposalStateFilter,
  column = 'proposal_id',
): RawBuilder<boolean> {
  const ref = sql.ref(column);

  if (filter.state === 'declined') {
    return sql`${ref} in (select proposal_id from proposals where state = 'declined')`;
  }

  if (filter.state === 'closed') {
    return sql`${ref} in (
      select proposal_id from proposals where state not in ('pending', 'deferred')
    )`;
  }

  return sql`${ref} in (
    select proposal_id from proposals
    where state in ('pending', 'deferred') and lapses_at > ${filter.nowMs ?? Number.MIN_SAFE_INTEGER}
  )`;
}
