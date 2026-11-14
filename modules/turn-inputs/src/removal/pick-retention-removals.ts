import type { InputRemovedCause, InputState } from '../utils/turn-inputs-tables';

export interface RetainedInput {
  readonly input_id: string;
  readonly key_id: string;
  readonly state: InputState;
  readonly bytes: number;
  readonly taken_at: number;
}

export interface Retention {
  readonly days: number;
  readonly bytes: number;
}

export interface RetentionRemoval {
  readonly input: RetainedInput;
  readonly cause: InputRemovedCause;
}

const dayMs = 86_400_000;

// A row past the days goes first, whatever its state. Then the oldest stored rows go until the
// stored bytes fit the bound.
export function pickRetentionRemovals(
  rows: readonly RetainedInput[],
  retention: Retention,
  now: number,
): readonly RetentionRemoval[] {
  const cutoff = now - retention.days * dayMs;

  const expired = rows
    .filter((row) => row.taken_at < cutoff)
    .map((input): RetentionRemoval => ({ input, cause: 'retention_days' }));

  const kept = rows
    .filter((row) => row.taken_at >= cutoff && row.state === 'stored')
    .toSorted((first, second) => first.taken_at - second.taken_at);

  const overflow: RetentionRemoval[] = [];
  let total = kept.reduce((sum, row) => sum + row.bytes, 0);

  for (const input of kept) {
    if (total <= retention.bytes) {
      break;
    }

    total -= input.bytes;

    overflow.push({ input, cause: 'retention_bytes' });
  }

  return [...expired, ...overflow];
}
