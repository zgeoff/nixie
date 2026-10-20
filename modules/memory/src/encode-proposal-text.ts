import { defineSealedCodec } from './define-sealed-codec';
import { proposalTextSchema } from './proposal-text-schema';
import type { ProposalText } from './sealed-types';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

// Seals a proposal's text under its item's key, with the proposal ID as additional data, so the
// ciphertext opens under no other proposal.
export function encodeProposalText(
  key: CryptoKey,
  proposalID: string,
  text: ProposalText,
): Promise<string> {
  return proposalText.encode(key, proposalID, text);
}
