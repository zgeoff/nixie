import type { StoreParts } from '../types';
import { removeClosedProposalKeys } from '../utils/key/remove-closed-proposal-keys';
import { removeSavedOfferKeys } from './remove-saved-offer-keys';

export async function removeLeftKeys(parts: StoreParts): Promise<void> {
  await removeClosedProposalKeys(parts);
  await removeSavedOfferKeys(parts);
}
