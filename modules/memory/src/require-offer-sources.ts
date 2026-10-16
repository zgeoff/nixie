import type { Kysely } from 'kysely';
import type { OfferAnswerRequest } from './gate-types';
import { requireLiveEvidence } from './require-live-evidence';
import { requireOpenOffer } from './require-open-offer';
import { requireUnforgottenRecords } from './require-unforgotten-records';
import type { MemoryTables } from './types';

// The records a save from an offer rests on: the offer, and the reply that presented it.
export interface OfferSources {
  readonly offerSequence: number;
  readonly replySequence: number;
}

// Refuses a save inside the version's transaction when the answer backed a forgotten item, the
// offer is already saved, or a forget of the image message, the presenting reply or the answer has
// started.
export async function requireOfferSources(
  db: Kysely<MemoryTables>,
  request: OfferAnswerRequest,
  sources: OfferSources,
): Promise<void> {
  await requireLiveEvidence(db, request.answerSequence);
  await requireOpenOffer(db, sources.offerSequence);

  await requireUnforgottenRecords(db, [
    request.image.messageSequence,
    sources.replySequence,
    request.answerSequence,
  ]);
}
