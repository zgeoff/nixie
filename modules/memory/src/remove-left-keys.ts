import { removeClosedProposalKeys } from './remove-closed-proposal-keys';
import { removeSavedOfferKeys } from './remove-saved-offer-keys';
import type { StoreParts } from './types';

export async function removeLeftKeys(parts: StoreParts): Promise<void> {
  await removeClosedProposalKeys(parts);
  await removeSavedOfferKeys(parts);
}
