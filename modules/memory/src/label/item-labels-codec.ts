import type { Labels } from '../types';
import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import { labelsSchema } from './labels-schema';

export interface LabelsRef {
  readonly itemID: string;
  readonly revision: number;
}

const itemLabels = defineSealedCodec('labels/', labelsSchema);

export const itemLabelsCodec = {
  encode: (key: CryptoKey, ref: LabelsRef, labels: Labels): Promise<string> =>
    itemLabels.encode(key, buildPlace(ref), { ...labels, triggers: [...labels.triggers] }),
  decode: (key: CryptoKey, ref: LabelsRef, sealed: string): Promise<Labels> =>
    itemLabels.decode(key, buildPlace(ref), sealed),
};

function buildPlace(ref: LabelsRef): string {
  return `${ref.itemID}/${String(ref.revision)}`;
}
