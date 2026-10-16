import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { OfferAnswerOutcome, OfferAnswerRequest } from './gate-types';
import type { OfferYes } from './read-offer-answer';
import { readOfferAnswer } from './read-offer-answer';
import { requireLiveEvidence } from './require-live-evidence';
import { requireOpenOffer } from './require-open-offer';
import { requireUnforgottenRecords } from './require-unforgotten-records';
import type { StoreParts, VersionRef } from './types';
import { writeRememberedItem } from './write-remembered-item';

// Applies an offered text on your plain typed yes, and writes nothing on any other answer. The text
// comes from the offer record, never from the model, so the version holds what the offer showed.
export async function writeOfferAnswer(
  parts: StoreParts,
  request: OfferAnswerRequest,
): Promise<OfferAnswerOutcome> {
  const answer = await readOfferAnswer(parts.context.log, request);

  if (answer === null) {
    return { status: 'declined' };
  }

  try {
    const ref = await writeConfirmedOffer(parts, request, answer);

    return { status: 'applied', itemID: ref.itemID, version: ref.version };
  } catch (error) {
    if (error instanceof ForgottenEvidenceError) {
      return { status: 'declined' };
    }

    throw error;
  }
}

// The quote is your yes then the text it confirmed, and the checks name the offer, so the text never
// reads as words you typed.
async function writeConfirmedOffer(
  parts: StoreParts,
  request: OfferAnswerRequest,
  answer: OfferYes,
): Promise<VersionRef> {
  const caller = request.caller;

  const newest = await findNewestMessage(parts.context.log, caller.thread);

  const group = buildWriteGroup(caller, newest);

  return writeRememberedItem(
    parts,
    {
      text: answer.text,
      provenance: {
        origin: caller.origin,
        source: 'owner',
        taskID: caller.taskID,
        proposalID: null,
        checks: { quote: 'pass', offer: { sequence: answer.offerSequence, answer: 'typed_yes' } },
        thread: caller.thread,
        model: caller.model,
      },
      evidence: answer.evidence,
      evidenceQuote: `${answer.typed} — confirming the offer to save: ${answer.text}`,
    },
    {
      noticeKey: group.noticeKey,
      requireInTransaction: async (db) => {
        await requireLiveEvidence(db, request.answerSequence);

        await requireUnforgottenRecords(db, [
          request.image.messageSequence,
          request.answerSequence,
        ]);

        await requireOpenOffer(db, answer.offerSequence);
      },
    },
  );
}
