import { waitForCondition } from '@heynixie/testing';

// Each turn starts its own conversation guest and Agent SDK process. On a 2 GiB host other work
// evicts the SDK's 257 MB binary, and a cold start alone measured 4.8 s on an idle host.
const TURN_TIMEOUT_MS = 30_000;

// A check that reads the conversation runs a request through nixie, and at a 5 ms interval those
// requests took a fifth of the turn's time from the guest's start.
const TURN_INTERVAL_MS = 100;

export function waitForTurn(check: () => boolean | Promise<boolean>): Promise<void> {
  return waitForCondition(check, { timeoutMs: TURN_TIMEOUT_MS, intervalMs: TURN_INTERVAL_MS });
}
