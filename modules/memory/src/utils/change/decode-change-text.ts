import { defineSealedCodec } from '../codec/define-sealed-codec';
import type { ChangeText } from '../codec/sealed-codec';
import { changeTextSchema } from '../schema/change-text-schema';

const changeText = defineSealedCodec('consolidation/', changeTextSchema);

export function decodeChangeText(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<ChangeText> {
  return changeText.decode(key, changeID, sealed);
}
