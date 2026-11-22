import type { Clock } from '@heynixie/clock';
import type { RunningCall } from './wait-for-running-calls';

export interface Admissions {
  readonly clock: Clock;

  // the calls a take-over waits for
  readonly running: Set<RunningCall>;

  // the admitted calls among them, open until their action's call settles
  readonly admitted: Set<RunningCall>;

  readonly isHeld: () => boolean;

  // how long an admitted call has to reach its computer call, which then sets the limit
  readonly turnWaitMs: number;
}

// Lets an action's call start unless a hold is open, and counts it as running in the same
// synchronous step, so a take-over that begins later waits for it. It answers null while a hold is
// open. The returned function ends the admission, and may run more than once.
export function admitRunningCall(admissions: Admissions): (() => void) | null {
  if (admissions.isHeld()) {
    return null;
  }

  const ended = Promise.withResolvers<void>();

  const call: RunningCall = {
    endsAtMs: admissions.clock.now() + admissions.turnWaitMs,
    ended: ended.promise,
  };

  admissions.running.add(call);
  admissions.admitted.add(call);

  return () => {
    admissions.running.delete(call);
    admissions.admitted.delete(call);
    ended.resolve();
  };
}

// A take-over gives up once any call it waits for passes its limit, so the computer call of an
// admitted action moves the admission's limit up to its own, and never down.
export function extendAdmissions(admitted: ReadonlySet<RunningCall>, endsAtMs: number): void {
  for (const call of admitted) {
    call.endsAtMs = Math.max(call.endsAtMs, endsAtMs);
  }
}
