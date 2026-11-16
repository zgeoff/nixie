import type { Labels } from '../types';

export interface LabelEntries {
  readonly find: (itemID: string) => Labels | undefined;
  readonly set: (itemID: string, labels: Labels) => void;
  readonly remove: (itemID: string) => void;
  readonly collectTopics: (excludedItemID: string | null) => readonly string[];
  readonly replaceAll: (entries: ReadonlyMap<string, Labels>) => void;
}

// The entries live in memory only, so a forgotten item's labels never outlive the process.
export function makeLabelEntries(): LabelEntries {
  let entries = new Map<string, Labels>();

  return {
    find: (itemID) => entries.get(itemID),
    set: (itemID, labels) => {
      entries.set(itemID, labels);
    },
    remove: (itemID) => {
      entries.delete(itemID);
    },
    collectTopics: (excludedItemID) =>
      [...entries].flatMap(([itemID, labels]) => (itemID === excludedItemID ? [] : [labels.topic])),
    replaceAll: (next) => {
      entries = new Map(next);
    },
  };
}
