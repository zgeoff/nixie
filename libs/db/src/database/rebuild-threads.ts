import type { Transaction } from 'kysely';
import { sql } from 'kysely';

// A record that leaves a thread or joins it shifts the counts of every later record on it.
export async function rebuildThreads(tx: Transaction<unknown>): Promise<void> {
  await sql`delete from threads`.execute(tx);
  await sql`delete from projection_changes where projection = 'threads'`.execute(tx);

  await sql`insert into projection_changes (sequence, projection, row_key, row)
    select sequence, 'threads', thread, json_object(
      'thread', thread,
      'first_sequence', first_sequence,
      'last_sequence', sequence,
      'record_count', record_count,
      'last_recorded_at', recorded_at
    )
    from (
      select sequence, thread, recorded_at,
        first_value(sequence) over w as first_sequence,
        row_number() over w as record_count
      from records
      where thread is not null
      window w as (partition by thread order by sequence)
    )`.execute(tx);

  await sql`insert into threads
      (thread, first_sequence, last_sequence, record_count, last_recorded_at)
    select thread, min(sequence), max(sequence), count(*),
      (select last.recorded_at from records as last
        where last.sequence = (select max(sequence) from records as newest
          where newest.thread = grouped.thread))
    from records as grouped
    where thread is not null
    group by thread`.execute(tx);
}
