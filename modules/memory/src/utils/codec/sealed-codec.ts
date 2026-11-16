import type { z } from 'zod';
import type { proposalTextSchema } from '../schema/proposal-text-schema';

export interface SealedCodec<Value> {
  readonly encode: (key: CryptoKey, place: string, value: Value) => Promise<string>;
  readonly decode: (key: CryptoKey, place: string, sealed: string) => Promise<Value>;
}

export type ProposalText = Readonly<z.output<typeof proposalTextSchema>>;
