// An offer the model cannot make or answer: an image that is no image of yours, a second offer for
// one image, or an answer that is not your reply to the offer. The message is the plain reason the
// model reads.
export class ImageOfferError extends Error {
  override readonly name = 'ImageOfferError';

  readonly code = 'OFFER_REFUSED';
}
