import type { Mock } from 'bun:test';
import { mock } from 'bun:test';

export interface StubCheck<Report> {
  // answers each call from the answer it holds, and records the call
  readonly check: Mock<() => Promise<Report>>;

  // answers every later call with this answer, such as one that never settles or rejects
  readonly answerWith: (answer: () => Promise<Report>) => void;
}

// Builds a stand-in for a health check whose answer a test swaps between rounds, such as a ready
// report and then one that never settles, so a test drives a check that changes over time.
export function buildStubCheck<Report>(answer: () => Promise<Report>): StubCheck<Report> {
  const state = { answer };

  return {
    check: mock(() => state.answer()),
    answerWith: (next) => {
      state.answer = next;
    },
  };
}
