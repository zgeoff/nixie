import type { z } from 'zod';
import type { changeTextSchema } from './change-text-schema';
import type { proposalTextSchema } from './proposal-text-schema';

export interface SealedCodec<Value> {
  readonly encode: (key: CryptoKey, place: string, value: Value) => Promise<string>;
  readonly decode: (key: CryptoKey, place: string, sealed: string) => Promise<Value>;
}

export type ChangeText = Readonly<z.output<typeof changeTextSchema>>;

export type ProposalText = Readonly<z.output<typeof proposalTextSchema>>;

export interface RatingNotePlace {
  readonly ratingID: string;
  readonly itemID: string;
}

export interface SealedSummary {
  readonly sealed: string;
  readonly shares: readonly SummaryShare[];
}

export interface SummaryShare {
  readonly itemID: string;
  readonly sealed: string;
}
