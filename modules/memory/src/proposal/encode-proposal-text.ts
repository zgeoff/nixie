import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import type { ProposalText } from '../utils/codec/sealed-codec';
import { proposalTextSchema } from '../utils/schema/proposal-text-schema';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

export function encodeProposalText(
  key: CryptoKey,
  proposalID: string,
  text: ProposalText,
): Promise<string> {
  return proposalText.encode(key, proposalID, text);
}
