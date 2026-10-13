import { z } from 'zod';
import { decodeSealedJSON } from './decode-sealed-json';
import type { ChangeText } from './encode-change-text';

// Opens what encodeChangeText sealed. A wrong key, another change's ID or a changed byte rejects.
export async function decodeChangeText(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<ChangeText> {
  const value = await decodeSealedJSON(key, `consolidation/${changeID}`, sealed);

  return changeText.parse(value);
}

const changeText = z.strictObject({
  text: z.string().nullable(),
  reason: z.string(),
  salt: z.string(),
});
