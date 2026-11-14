import { pauseStore } from './pause-store';
import { readMockPause } from './read-mock-pause';

export function probeMockTaskPaused(taskID: string): boolean {
  if (readMockPause() === null) {
    return false;
  }

  const exempt = pauseStore.pauseExemptions.findFirst((query) => query.where({ taskID }));

  return exempt === undefined;
}
