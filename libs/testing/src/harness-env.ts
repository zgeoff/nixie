// The environment variables the crash harness starts nixie with: the clock's time in ms since the
// epoch, and the fault points held from the start, as JSON.
export const harnessEnv = {
  clockMs: 'NIXIE_TEST_CLOCK_MS',
  faultPoints: 'NIXIE_TEST_FAULT_POINTS',
} as const;
