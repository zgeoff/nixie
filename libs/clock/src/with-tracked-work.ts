import { workTrackerSlot } from './work-tracker-slot';

export function withTrackedWork<T>(work: () => Promise<T>): Promise<T> {
  const tracker = workTrackerSlot.tracker;

  if (!NIXIE_TEST_BUILD || tracker === null) {
    return work();
  }

  return tracker.runWork(work);
}
