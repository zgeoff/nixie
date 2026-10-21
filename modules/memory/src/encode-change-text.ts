import { changeTextSchema } from './change-text-schema';
import { defineSealedCodec } from './define-sealed-codec';
import type { ChangeText } from './sealed-types';

const changeText = defineSealedCodec('consolidation/', changeTextSchema);

export function encodeChangeText(
  key: CryptoKey,
  changeID: string,
  text: ChangeText,
): Promise<string> {
  return changeText.encode(key, changeID, text);
}
