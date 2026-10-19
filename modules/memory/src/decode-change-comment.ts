import { defineSealedCodec } from './define-sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';

const changeComment = defineSealedCodec('consolidation-comment/', sealedTextSchema);

// Opens what encodeChangeComment sealed. A wrong key, another change's ID or a changed byte rejects.
export async function decodeChangeComment(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<string> {
  const comment = await changeComment.decode(key, changeID, sealed);

  return comment.text;
}
