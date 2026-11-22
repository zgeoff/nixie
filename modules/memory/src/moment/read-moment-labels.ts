import type { Log } from '@heynixie/log';
import type { MomentState, MomentTables } from '../utils/moment-context';
import { readMomentRow } from './read-moment-row';
import { readMomentText } from './text/read-moment-text';

export interface MomentLabel {
  readonly shortID: string;

  // null once the title's key is gone
  readonly title: string | null;
  readonly state: MomentState;
}

// The label that moment.read shows for each moment: its title and state, never its note or its
// reflections. A moment that no row holds has no entry.
export async function readMomentLabels(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  momentIDs: readonly string[],
): Promise<ReadonlyMap<string, MomentLabel>> {
  const db = log.writer.db.$extendTables<MomentTables>();

  const labels = new Map<string, MomentLabel>();

  for (const momentID of momentIDs) {
    const row = await readMomentRow(db, momentID);

    if (row === null) {
      continue;
    }

    const title =
      row.state === 'active' || row.state === 'retired'
        ? await readMomentText(log, row.title_sequence, 'title')
        : null;

    labels.set(momentID, { shortID: row.short_id, title, state: row.state });
  }

  return labels;
}
