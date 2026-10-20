import type { Log } from '@heynixie/log';
import type { OfferAnswerRequest } from './gate-types';
import { ImageOfferError } from './image-offer-error';
import { readImageOffer } from './read-image-offer';
import { readOfferPresentation } from './read-offer-presentation';
import type { OfferYes } from './read-typed-yes';
import { readTypedYes } from './read-typed-yes';
import { requireFirstAnswer } from './require-first-answer';

// Reads your answer to the model's offer for an image, or null when it saves nothing: it is no plain
// typed yes to the reply that presented the offer, or the offer's text or image is gone. An answer
// to no offer, or a message that is not your first one after the offer, is refused.
export async function readOfferAnswer(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: OfferAnswerRequest,
): Promise<OfferYes | null> {
  const thread = request.caller.thread;

  const offer = await readImageOffer(log, { thread, image: request.image });

  if (offer === null) {
    throw new ImageOfferError(
      `You made no offer for image ${String(request.image.image)} of #${String(request.image.messageSequence)}, so nothing was saved.`,
    );
  }

  await requireFirstAnswer(log, {
    thread,
    offerSequence: offer.sequence,
    answerSequence: request.answerSequence,
  });

  const replySequence =
    offer.text === null
      ? null
      : await readOfferPresentation(log, {
          thread,
          offerSequence: offer.sequence,
          answerSequence: request.answerSequence,
          text: offer.text,
        });

  if (offer.text === null || replySequence === null) {
    return null;
  }

  return readTypedYes(log, request, {
    offerSequence: offer.sequence,
    text: offer.text,
    replySequence,
  });
}
