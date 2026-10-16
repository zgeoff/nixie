import { removeClosedProposalKeys } from './remove-closed-proposal-keys';
import { removeSavedOfferKeys } from './remove-saved-offer-keys';
import type { StoreParts } from './types';

// Removes at store start each key that a crash left behind after its write committed: the key of a
// closed new item's proposal, and the key of a saved offer.
export async function removeLeftKeys(parts: StoreParts): Promise<void> {
  await removeClosedProposalKeys(parts);
  await removeSavedOfferKeys(parts);
}
