export type RotationStep =
  | { readonly kind: 'rotate'; readonly value: 'valid' | 'junk'; readonly reason: string }
  | {
      readonly kind: 'rotate-later';
      readonly value: 'valid' | 'junk';
      readonly reason: string;
      readonly delayMs: number;
    }
  | { readonly kind: 'probe'; readonly reason: string };

export interface PlannedCall {
  readonly count: number;
  readonly seconds: number;
}

// The CLI sends its next model request as soon as a call's result arrives, so 300 ms after the
// result that request is in flight: run 1 measured about 950 ms from result to stream end.
const inFlightDelayMs = 300;

// A delay counts from the call's start, and the call's result arrives after its wait.
export function planRotation(call: PlannedCall, restoreAfterResultMs: number): RotationStep[] {
  const resultMs = call.seconds * 1000;

  if (call.count === 2) {
    return [
      {
        kind: 'rotate-later',
        value: 'valid',
        reason: 'same value, model request in flight',
        delayMs: resultMs + inFlightDelayMs,
      },
    ];
  }
  if (call.count === 4) {
    return [
      { kind: 'rotate', value: 'junk', reason: 'between model requests' },
      { kind: 'probe', reason: 'junk value live' },
      { kind: 'rotate', value: 'valid', reason: 'between model requests' },
      { kind: 'probe', reason: 'valid value back' },
    ];
  }
  if (call.count === 6) {
    return [
      { kind: 'rotate', value: 'junk', reason: 'across the next model request' },
      {
        kind: 'rotate-later',
        value: 'valid',
        reason: `restore ${String(restoreAfterResultMs)} ms after the result`,
        delayMs: resultMs + restoreAfterResultMs,
      },
    ];
  }
  return [];
}
