import { z } from 'zod';
import { decodeSealedJSON } from './decode-sealed-json';

// Opens what encodeChangeComment sealed. A wrong key, another change's ID or a changed byte rejects.
export async function decodeChangeComment(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<string> {
  const value = await decodeSealedJSON(key, `consolidation-comment/${changeID}`, sealed);

  return changeComment.parse(value).text;
}

const changeComment = z.strictObject({ text: z.string() });
