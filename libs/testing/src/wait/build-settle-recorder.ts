import type { Mock } from 'bun:test';
import { mock } from 'bun:test';

export interface SettleRecorder<Input, Report> {
  readonly check: (input: Input) => Promise<Report>;

  readonly settled: Mock<() => void>;
}

export function buildSettleRecorder<Input, Report>(
  call: (input: Input) => Promise<Report>,
): SettleRecorder<Input, Report> {
  const settled = mock(() => {});

  return {
    check: async (input) => {
      try {
        return await call(input);
      } finally {
        settled();
      }
    },
    settled,
  };
}
