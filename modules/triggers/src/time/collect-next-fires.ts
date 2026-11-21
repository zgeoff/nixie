import type { Trigger } from '@heynixie/contract';
import type { NextFire } from './pick-next-fire';
import { pickNextFire } from './pick-next-fire';

export interface NextFiresQuery {
  // the watermark, epoch milliseconds
  readonly afterMs: number;

  // the IANA zone the trigger reads in
  readonly zone: string;

  // the most fires to give
  readonly count: number;
}

// The next slots of a trigger after the watermark, oldest first. It stops early when the trigger
// has none left.
export function collectNextFires(
  definitionID: string,
  trigger: Trigger,
  query: NextFiresQuery,
): NextFire[] {
  const fires: NextFire[] = [];
  let cursor = query.afterMs;

  while (fires.length < query.count) {
    const fire = pickNextFire(definitionID, trigger, cursor, query.zone);

    if (fire === null || fire.scheduledFor <= cursor) {
      break;
    }

    fires.push(fire);

    cursor = fire.scheduledFor;
  }

  return fires;
}
