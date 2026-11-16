export type ItemValueRef =
  | {
      readonly value: 'version';
      readonly itemID: string;
      readonly version: number;

      // the version's record
      readonly sequence: number;
    }
  | {
      // only for a version that has a version key
      readonly value: 'version-quote';
      readonly itemID: string;
      readonly version: number;
      readonly quote: 'evidence' | 'intent';

      // the quoted record
      readonly recordSequence: number;
    }
  | {
      // a new item's proposal and a rejected edit, and the proposal's labels
      readonly value: 'proposal';
      readonly itemID: string;

      // the record that holds the ciphertext
      readonly sequence: number;
    }
  | {
      readonly value: 'labels';
      readonly itemID: string;

      // the memory.labelled record
      readonly sequence: number;
    };

export type ItemValueKey =
  | {
      readonly status: 'readable';
      readonly keyID: string;
      readonly key: CryptoKey;

      // a quote's inner key
      readonly recordKey?: CryptoKey;
    }
  | { readonly status: 'removed' | 'shredded' | 'unreadable' };
