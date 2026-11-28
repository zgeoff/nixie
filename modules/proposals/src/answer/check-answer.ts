import type { Transaction } from 'kysely';
import type { ProposalFamily } from '../rows/proposal-tables';
import { readProposal } from '../rows/read-proposal';
import { pickProposalChoices } from './pick-proposal-choices';
import type {
  ProposalAnswerInput,
  ProposalHashes,
  ProposalRefusal,
  SharedProposal,
} from './proposal-kind-handler';
import type { Checked, ProposalCoreDeps } from './types';
import { writeFoldedProposal } from './write-folded-proposal';

// The checks 2 to 4 of an answer, in order. The first that fails refuses the answer.
export async function checkAnswer(
  deps: ProposalCoreDeps,
  tx: Transaction<unknown>,
  answer: ProposalAnswerInput,
  family: ProposalFamily | undefined,
): Promise<Checked> {
  const row = await readOrBuildProposal(deps, tx, answer.proposalID);

  if (row === null || (family !== undefined && row.family !== family)) {
    return refuse({ error: 'NOT_FOUND' });
  }

  if (row.state !== 'pending' && row.state !== 'deferred') {
    return refuse({ error: 'CLOSED', state: row.state });
  }

  const now = deps.clock.now();

  if (row.lapsesAt <= now) {
    return refuse({ error: 'CLOSED', state: 'lapsed' });
  }

  const handler = deps.handlers.get(row.family);

  if (handler === undefined) {
    return refuse({ error: 'NOT_ALLOWED', reason: 'no_handler' });
  }

  const current = await handler.readHashes(tx, row);

  const isActionStale = answer.actionHash !== null && answer.actionHash !== current.action;

  const isRuleStale =
    answer.choice === 'always_allow' && (answer.ruleHash ?? null) !== current.rule;

  if (isActionStale || isRuleStale) {
    return refuse({
      error: 'CONFLICT',
      current: { actionHash: current.action, ruleHash: current.rule },
    });
  }

  const placeRefusal = checkPlaceAnswer(answer, current.place ?? null);

  if (placeRefusal !== null) {
    const refusal: ProposalRefusal =
      placeRefusal === 'stale'
        ? { error: 'CONFLICT', current: { actionHash: current.action, ruleHash: current.rule } }
        : { error: 'NOT_ALLOWED', reason: placeRefusal };

    return refuse(refusal);
  }

  const reason = findNotAllowedReason(row, answer, now);

  return reason === null
    ? { status: 'checked', row, handler }
    : refuse({ error: 'NOT_ALLOWED', reason });
}

async function readOrBuildProposal(
  deps: ProposalCoreDeps,
  tx: Transaction<unknown>,
  proposalID: string,
): Promise<SharedProposal | null> {
  const isProjected = deps.log.projections.some(
    (projection) => projection.table === deps.projection.table,
  );

  const row = isProjected ? await readProposal(tx, proposalID) : null;

  if (row !== null) {
    return row;
  }

  await writeFoldedProposal(tx, deps.projection, proposalID);

  return readProposal(tx, proposalID);
}

function refuse(refusal: ProposalRefusal): Checked {
  return { status: 'refused', refusal };
}

// A trust answer needs the place hash of its level, which only a card that offered the place
// carries. An answer with the action hash alone is refused.
function checkPlaceAnswer(
  answer: ProposalAnswerInput,
  place: ProposalHashes['place'],
): 'trust_choice' | 'no_place_offer' | 'place_hash' | 'stale' | null {
  if (answer.trust === undefined) {
    return answer.placeHash === undefined ? null : 'trust_choice';
  }

  if (answer.choice !== 'approve') {
    return 'trust_choice';
  }

  if (place === undefined || place === null) {
    return 'no_place_offer';
  }

  if (answer.placeHash === undefined) {
    return 'place_hash';
  }

  return answer.placeHash === place[answer.trust] ? null : 'stale';
}

const minDeferMs = 60_000;
const maxDeferMs = 30 * 24 * 60 * 60 * 1000;
const maxNoteLength = 500;

function findNotAllowedReason(
  row: SharedProposal,
  answer: ProposalAnswerInput,
  now: number,
): string | null {
  if (!pickProposalChoices(row).includes(answer.choice)) {
    return 'choice';
  }

  if (answer.memory !== undefined && (row.kind !== 'memory_write' || answer.choice !== 'approve')) {
    return 'memory';
  }

  if (
    answer.note !== undefined &&
    (answer.note.length === 0 || answer.note.length > maxNoteLength)
  ) {
    return 'note';
  }

  if (answer.choice === 'defer') {
    const until = answer.deferUntil;

    if (until === undefined || until < now + minDeferMs || until > now + maxDeferMs) {
      return 'defer_until';
    }
  }

  return null;
}
