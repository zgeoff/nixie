import { pauseStore } from './pause-store';

export function readMockPause() {
  const pause = pauseStore.pauses.all().findLast(() => true);

  return pause === undefined ? null : { cause: pause.cause, since: pause.since };
}
