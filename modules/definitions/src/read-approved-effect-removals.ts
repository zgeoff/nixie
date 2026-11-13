import type { Kysely } from 'kysely';
import { readRuleProposals } from './read-rule-proposals';

// `tool:effect` for each effect removal that an approved proposal named.
export async function readApprovedEffectRemovals(
  db: Kysely<unknown>,
): Promise<ReadonlySet<string>> {
  const proposals = await readRuleProposals(db);

  return new Set(
    proposals
      .filter((entry) => entry.outcome === 'approved')
      .flatMap((entry) =>
        entry.proposal.effectChanges.flatMap((change) =>
          change.remove.map((effect) => `${change.tool}:${effect}`),
        ),
      ),
  );
}
