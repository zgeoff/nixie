import type { Labels } from '../types';
import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import { labelsSchema } from './labels-schema';

const proposalLabels = defineSealedCodec('proposal-labels/', labelsSchema);

export const proposalLabelsCodec = {
  encode: (key: CryptoKey, proposalID: string, labels: Labels): Promise<string> =>
    proposalLabels.encode(key, proposalID, { ...labels, triggers: [...labels.triggers] }),
  decode: (key: CryptoKey, proposalID: string, sealed: string): Promise<Labels> =>
    proposalLabels.decode(key, proposalID, sealed),
};
