import type { StoredTextFields, TextSource } from '../wake/text-sources';

export interface TestTextSource {
  readonly source: TextSource;

  // makes the source hold no fields for any text, as a forget does
  readonly forget: () => void;

  // makes the source hold these fields for every text
  readonly hold: (fields: StoredTextFields) => void;
}

// A text source of the ID `test-texts` whose store holds one pair of fields for every text.
export function buildTestTextSource(): TestTextSource {
  let fields: StoredTextFields | null = { from: 'Example', body: 'Your code is 5521' };

  return {
    source: {
      sourceID: 'test-texts',
      readFields: () => Promise.resolve(fields),
    },
    forget: () => {
      fields = null;
    },
    hold: (next) => {
      fields = next;
    },
  };
}
