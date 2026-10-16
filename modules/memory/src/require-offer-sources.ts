import type { Kysely } from 'kysely';
import type { OfferAnswerRequest } from './gate-types';
import { requireLiveEvidence } from './require-live-evidence';
import { requireOpenOffer } from './require-open-offer';
import { requireUnforgottenRecords } from './require-unforgotten-records';
import type { MemoryTables } from './types';

// Refuses a save inside the version's transaction when the answer backed a forgotten item, the
// offer is already saved, or a forget of the image message or the answer has started.
export async function requireOfferSources(
  db: Kysely<MemoryTables>,
  request: OfferAnswerRequest,
  offerSequence: number,
): Promise<void> {
  await requireLiveEvidence(db, request.answerSequence);
  await requireOpenOffer(db, offerSequence);
  await requireUnforgottenRecords(db, [request.image.messageSequence, request.answerSequence]);
}
