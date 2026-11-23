import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Clock } from '@heynixie/clock';
import type { Admission } from './types';
import type { RunningCall } from './wait-for-running-calls';

export interface Admissions {
  readonly clock: Clock;

  // the calls a take-over waits for
  readonly running: Set<RunningCall>;

  // the admitted calls among them, open until their action's call settles
  readonly admitted: Set<RunningCall>;

  // the admission of the call that runs now, which its computer calls read
  readonly scope: AsyncLocalStorage<RunningCall>;

  readonly isHeld: () => boolean;

  // how long an admitted call has to reach its computer call, which then sets the limit
  readonly turnWaitMs: number;
}

// Lets a call start unless a hold is open, and counts it as running in the same synchronous step,
// so a later take-over waits for it. Only the computer calls inside its work move its limit.
export function admitRunningCall(admissions: Admissions): Admission | null {
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

  return {
    run: (work) => admissions.scope.run(call, work),
    release: () => {
      admissions.running.delete(call);
      admissions.admitted.delete(call);
      ended.resolve();
    },
  };
}

// The open admission of the call that runs now. A promise that the call started outside its own
// work, such as a timer of the guest, still sees the admission after it ends, so an ended one
// counts as none.
export function findAdmission(
  admissions: Pick<Admissions, 'admitted' | 'scope'>,
): RunningCall | null {
  const call = admissions.scope.getStore();

  return call !== undefined && admissions.admitted.has(call) ? call : null;
}
