import type { StatusEntry } from '@heynixie/sessions';
import type { MomentWeekCount } from './read-week-count';
import { renderWeekCount } from './render-week-count';

export function buildMomentStatus(
  readWeekCount: (at: number) => Promise<MomentWeekCount>,
  ownerName: string | null,
): StatusEntry {
  return {
    name: 'moments_kept',
    read: async (facts) => {
      const count = await readWeekCount(facts.openedAt.getTime());

      return { value: count.total, text: renderWeekCount(count, ownerName) };
    },
  };
}
