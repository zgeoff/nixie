import type { z } from 'zod';
import type { changeTextSchema } from './change-text-schema';
import type { proposalTextSchema } from './proposal-text-schema';

// Seals one shape of JSON under a key and opens it again. The place joins the codec's prefix as the
// additional data.
export interface SealedCodec<Value> {
  readonly encode: (key: CryptoKey, place: string, value: Value) => Promise<string>;
  readonly decode: (key: CryptoKey, place: string, sealed: string) => Promise<Value>;
}

export type ChangeText = Readonly<z.output<typeof changeTextSchema>>;

export type ProposalText = Readonly<z.output<typeof proposalTextSchema>>;

// Where a note belongs: the rating that holds it and the item it rates.
export interface RatingNotePlace {
  readonly ratingID: string;
  readonly itemID: string;
}

// A consolidation summary as the store keeps it: the text sealed under a fresh key, and that key
// split into one share for each item the session was shown, each share sealed under its item's key.
export interface SealedSummary {
  readonly sealed: string;
  readonly shares: readonly SummaryShare[];
}

export interface SummaryShare {
  readonly itemID: string;
  readonly sealed: string;
}
