import type { ReleaseStartOutcome } from '@heynixie/server/test-utils';
import { match } from 'ts-pattern';
import { z } from 'zod';

export type RollbackCheckResult =
  | { readonly verdict: 'pass'; readonly previous: string }
  | {
      readonly verdict: 'declared';
      readonly previous: string;
      readonly oldestReader: number;
      readonly previousWrites: number;
    }
  | { readonly verdict: 'fail'; readonly previous: string; readonly output: string };

const databaseSchema = z.object({ isReady: z.boolean() });
const readyBodySchema = z.object({ parts: z.object({ database: databaseSchema }) });

// Only the database part decides: the definitions and imp parts stay unready on a data directory
// that nothing seeded. A refusal passes as declared when this build raised its oldest reader past
// what the previous release writes.
export function pickRollbackResult(
  previous: string,
  outcome: ReleaseStartOutcome,
  oldestReader: number,
): RollbackCheckResult {
  return match(outcome)
    .with({ outcome: 'started' }, (started): RollbackCheckResult => {
      const answer = `/health/ready answered ${String(started.readyStatus)} ${started.readyBody}`;

      return isDatabaseReady(started.readyBody)
        ? { verdict: 'pass', previous }
        : { verdict: 'fail', previous, output: `${answer}\n${started.output}` };
    })
    .with({ outcome: 'refused' }, (refused): RollbackCheckResult => {
      const writes = findDeclaredWrites(refused.output, oldestReader);

      return writes === null
        ? { verdict: 'fail', previous, output: refused.output }
        : { verdict: 'declared', previous, oldestReader, previousWrites: writes };
    })
    .with({ outcome: 'timeout' }, (timeout): RollbackCheckResult => {
      const stage = timeout.stage === 'listening' ? 'listen or exit' : '/health/ready answer';
      const waited = `no ${stage} within ${String(timeout.timeoutMs)} ms`;

      return { verdict: 'fail', previous, output: `${waited}\n${timeout.output}` };
    })
    .exhaustive();
}

export function isDatabaseReady(readyBody: string): boolean {
  const body = readyBodySchema.safeParse(parseJSON(readyBody));

  return body.success && body.data.parts.database.isReady;
}

const schemaTooNewPattern =
  /database schema \d+ needs a build that writes schema (?<needed>\d+) or later, and this build writes schema (?<writes>\d+)/u;

// Returns what the refusing release writes, or null when this build did not declare the refusal
function findDeclaredWrites(output: string, oldestReader: number): number | null {
  const groups = schemaTooNewPattern.exec(output)?.groups;

  if (groups === undefined) {
    return null;
  }

  const needed = Number(groups['needed']);
  const writes = Number(groups['writes']);

  return needed === oldestReader && writes < needed ? writes : null;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
