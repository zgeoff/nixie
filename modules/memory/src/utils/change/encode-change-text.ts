import { defineSealedCodec } from '../codec/define-sealed-codec';
import type { ChangeText } from '../codec/sealed-codec';
import { changeTextSchema } from '../schema/change-text-schema';

const changeText = defineSealedCodec('consolidation/', changeTextSchema);

export function encodeChangeText(
  key: CryptoKey,
  changeID: string,
  text: ChangeText,
): Promise<string> {
  return changeText.encode(key, changeID, text);
}
