import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { OfferAnswerOutcome, OfferAnswerRequest } from './gate-types';
import { readOfferAnswer } from './read-offer-answer';
import type { OfferYes } from './read-typed-yes';
import { removeOfferKey } from './remove-offer-key';
import { requireOfferSources } from './require-offer-sources';
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
// reads as words you typed. The offer record's key goes once the version commits, and store start
// removes a key that a crash left behind.
async function writeConfirmedOffer(
  parts: StoreParts,
  request: OfferAnswerRequest,
  answer: OfferYes,
): Promise<VersionRef> {
  const caller = request.caller;

  const newest = await findNewestMessage(parts.context.log, caller.thread);

  const group = buildWriteGroup(caller, newest);

  const ref = await writeRememberedItem(
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
      requireInTransaction: (db) => requireOfferSources(db, request, answer),
    },
  );

  await removeOfferKey(parts.context.log, answer.offerSequence);

  return ref;
}
