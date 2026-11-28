import type { JSONObject } from '@heynixie/log';
import type { ProposalAnswerInput, ProposalRefusal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { buildCardPlaceOffer } from '../place/build-card-place-offer';
import { parseProposedPlaces } from '../place/parse-proposed-places';
import type { PlaceContext } from '../place/place-context';
import { writePlaceTrustedInTransaction } from '../place/write-place-trusted-in-transaction';

export interface ApprovedCallFacts {
  readonly tool: string;
  readonly input: JSONObject;
  readonly destinations: readonly string[];
}

// Writes what an approval trusts beside its action: the place a trust answer names, or the ticked
// places of an approved places.propose. A refusal writes nothing.
export async function writeApprovalTrusts(
  readPlaces: (() => PlaceContext | null) | undefined,
  tx: Transaction<unknown>,
  call: ApprovedCallFacts,
  answer: ProposalAnswerInput,
): Promise<ProposalRefusal | null> {
  const places = readPlaces?.() ?? null;

  if (answer.trust !== undefined) {
    const offer = buildCardPlaceOffer(call.destinations);

    if (offer === null) {
      return { error: 'NOT_ALLOWED', reason: 'no_place_offer' };
    }

    if (places === null) {
      return { error: 'NOT_ALLOWED', reason: 'places_unavailable' };
    }

    const trusted = await writePlaceTrustedInTransaction(tx, places, {
      key: offer.key,
      trust: answer.trust,
      addedBy: 'card',
      isUnblocking: false,
    });

    return toRefusal(trusted);
  }

  if (call.tool !== 'places.propose') {
    return null;
  }

  const proposed = parseProposedPlaces(call.input);

  if (proposed.status === 'refused') {
    return { error: 'NOT_ALLOWED', reason: 'places_refused' };
  }

  const ticked = answer.tickedPlaces;

  const lines = proposed.places.filter(
    (_place, index) => ticked === undefined || ticked.includes(index),
  );

  if (lines.length > 0 && places === null) {
    return { error: 'NOT_ALLOWED', reason: 'places_unavailable' };
  }

  for (const line of lines) {
    invariant(places, 'a ticked place needs the directory');

    // an approval of a proposal takes the passkey check, so it may lift a block
    await writePlaceTrustedInTransaction(tx, places, {
      key: line.key,
      trust: line.trust,
      addedBy: 'proposal',
      isUnblocking: true,
    });
  }

  return null;
}

function toRefusal(
  trusted: Awaited<ReturnType<typeof writePlaceTrustedInTransaction>>,
): ProposalRefusal | null {
  if (trusted.status === 'blocked') {
    return { error: 'NOT_ALLOWED', reason: 'place_blocked' };
  }

  return trusted.status === 'refused'
    ? { error: 'NOT_ALLOWED', reason: `place_${trusted.fault}` }
    : null;
}
