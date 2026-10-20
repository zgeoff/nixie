import { defineSealedCodec } from './define-sealed-codec';
import { proposalTextSchema } from './proposal-text-schema';
import type { ProposalText } from './sealed-types';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

// Opens what encodeProposalText sealed. A wrong key, another proposal's ID or a changed byte
// rejects.
export function decodeProposalText(
  key: CryptoKey,
  proposalID: string,
  sealed: string,
): Promise<ProposalText> {
  return proposalText.decode(key, proposalID, sealed);
}
