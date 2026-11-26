import type { z } from 'zod';
import type { controlRoutes } from './harness/control-routes';

type Write = Readonly<
  Omit<z.output<typeof controlRoutes.calendarWrites.output>['writes'][number], 'guests'>
> & { readonly guests: readonly string[] };

interface ExpectedWrites {
  readonly count: number;

  // the `sendUpdates` that the last write asked Google for; checked when any write is expected
  readonly sendUpdates?: string | undefined;

  // an address that the last written event has as a guest
  readonly guest?: string | undefined;
}

// An invitation that went out twice, or not at all, or without the emails that tell the guest,
// shows in the calendar that the fake Calendar kept, which no record of nixie's own can show.
export function pickCalendarWrittenRefusal(
  writes: readonly Write[],
  expected: ExpectedWrites,
): string | null {
  if (writes.length !== expected.count) {
    return `the fake Calendar took ${writes.length} event writes, not ${expected.count}`;
  }

  const last = writes.at(-1);

  if (last === undefined) {
    return null;
  }

  if (expected.sendUpdates !== undefined && last.sendUpdates !== expected.sendUpdates) {
    return `the last write asked for sendUpdates ${last.sendUpdates}, not ${expected.sendUpdates}`;
  }

  const guest = expected.guest?.toLowerCase();

  if (guest !== undefined && !last.guests.includes(guest)) {
    return `the written event has the guests ${last.guests.join(', ') || 'none'}, not ${guest}`;
  }

  return null;
}
