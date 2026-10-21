import type { Mock } from 'bun:test';
import { mock } from 'bun:test';

export interface StubCheck<Report> {
  readonly check: Mock<() => Promise<Report>>;

  readonly answerWith: (answer: () => Promise<Report>) => void;
}

export function buildStubCheck<Report>(answer: () => Promise<Report>): StubCheck<Report> {
  const state = { answer };

  return {
    check: mock(() => state.answer()),
    answerWith: (next) => {
      state.answer = next;
    },
  };
}
