import type { WorkTracker } from './types';
import { workTrackerSlot } from './work-tracker-slot';

export function setWorkTracker(tracker: WorkTracker | null): void {
  if (!NIXIE_TEST_BUILD && tracker !== null) {
    throw new Error('a work tracker exists only in a test build');
  }

  workTrackerSlot.tracker = tracker;
}
