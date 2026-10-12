import { z } from 'zod';
import { decodeSealedJSON } from './decode-sealed-json';
import type { ProposalText } from './encode-proposal-text';

// Opens what encodeProposalText sealed. A wrong key, another proposal's ID or a changed byte
// rejects.
export async function decodeProposalText(
  key: CryptoKey,
  proposalID: string,
  sealed: string,
): Promise<ProposalText> {
  const value = await decodeSealedJSON(key, `proposal/${proposalID}`, sealed);

  return proposalText.parse(value);
}

const proposalText = z.strictObject({
  text: z.string(),
  quote: z.string().nullable(),
  checkerReason: z.string().nullable(),
  salt: z.string(),
});
