import type { MemoryKillRead } from '@heynixie/sandbox';
import { formatCodeRunSize } from './format-code-run-size';

export type CodeRunLimitKind = 'wall_time' | 'memory' | 'killed' | 'output' | 'files';

export interface CodeRunLimitHit {
  readonly kind: CodeRunLimitKind;
  readonly sentence: string;
}

export interface CodeRunLimitFacts {
  // nixie aborted the program at its wall time
  readonly didStop: boolean;
  readonly signal: string | null;
  readonly before: MemoryKillRead;
  readonly after: MemoryKillRead;

  // the streams that passed their cap, in stdout, stderr order
  readonly cutStreams: readonly ('stdout' | 'stderr')[];

  // null when the listing of out/ stayed within both files limits
  readonly filesPassed: { readonly count: number; readonly bytes: number } | null;
}

// The first limit the program reached, in the order of the limits table.
export function pickCodeRunLimit(facts: CodeRunLimitFacts): CodeRunLimitHit | null {
  if (facts.didStop) {
    return {
      kind: 'wall_time',
      sentence: 'The program ran past its limit of 60 s, so nixie stopped it.',
    };
  }

  if (
    facts.before.kind === 'count' &&
    facts.after.kind === 'count' &&
    facts.after.kills > facts.before.kills
  ) {
    return {
      kind: 'memory',
      sentence:
        'The program ran out of its 512 MiB of memory. For a large CSV, read it with duckdb.',
    };
  }

  const isCountRead = facts.before.kind === 'count' && facts.after.kind === 'count';

  if (facts.signal === 'SIGKILL' && !isCountRead) {
    return {
      kind: 'killed',
      sentence:
        'The program was killed by `SIGKILL`, which nixie did not send. Running out of its 512 MiB of memory is one cause.',
    };
  }

  const [cutStream] = facts.cutStreams;

  if (cutStream !== undefined) {
    return {
      kind: 'output',
      sentence: `The program wrote more than 1 MiB to ${cutStream}, and nixie kept the first 1 MiB.`,
    };
  }

  if (facts.filesPassed !== null) {
    const size = formatCodeRunSize(facts.filesPassed.bytes);

    return {
      kind: 'files',
      sentence: `The program wrote ${facts.filesPassed.count} files of ${size} under out/, past the limit of 50 files and 20 MiB, so nixie returned none.`,
    };
  }

  return null;
}
