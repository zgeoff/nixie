import type { ChangeAnswer, ChangeOutcome } from './consolidation-types';
import type { StoreParts } from './types';
import { writeChangeApproval } from './write-change-approval';

// Approves a whole diff as one approval per change, in the order given, each its own record. A
// change that the store refuses, such as one whose input moved on, applies nothing and reports
// its error's code, and the changes after it still apply.
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

// the store's refusals of one change; any other error, such as a failed database, stops the diff
const refusalCodes: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'PROPOSAL_HASH',
  'PROPOSAL_CLOSED',
  'STALE_VERSION',
  'WRONG_STATE',
  'PINNED_CORE_FULL',
]);
