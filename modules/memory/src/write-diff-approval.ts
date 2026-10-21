import type { ChangeAnswer, ChangeOutcome } from './consolidation-types';
import type { StoreParts } from './types';
import { writeChangeApproval } from './write-change-approval';

export async function writeDiffApproval(
  parts: StoreParts,
  answers: readonly ChangeAnswer[],
): Promise<readonly ChangeOutcome[]> {
  const outcomes: ChangeOutcome[] = [];

  for (const answer of answers) {
    const outcome = await tryApproveChange(parts, answer);

    outcomes.push(outcome);
  }

  return outcomes;
}

const refusalCodes: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'PROPOSAL_HASH',
  'PROPOSAL_CLOSED',
  'STALE_VERSION',
  'WRONG_STATE',
  'PINNED_CORE_FULL',
]);

async function tryApproveChange(parts: StoreParts, answer: ChangeAnswer): Promise<ChangeOutcome> {
  try {
    const versions = await writeChangeApproval(parts, answer);

    return { changeID: answer.changeID, status: 'applied', versions };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;

    if (typeof code !== 'string' || !refusalCodes.has(code)) {
      throw error;
    }

    return { changeID: answer.changeID, status: 'refused', code };
  }
}
