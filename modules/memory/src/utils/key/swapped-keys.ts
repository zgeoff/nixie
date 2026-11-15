// The keys of a stored tool result that can hold a UUID the model must read as a short ID, and the
// table each one names.
export type ShortIDKind = 'moment' | 'item';

export const swappedKeys: Readonly<Record<string, { kind: ShortIDKind; isList: boolean }>> = {
  momentID: { kind: 'moment', isList: false },
  momentIDs: { kind: 'moment', isList: true },
  itemID: { kind: 'item', isList: false },
  itemIDs: { kind: 'item', isList: true },
};

export interface ShortIDLookup {
  readonly moment: ReadonlyMap<string, string>;
  readonly item: ReadonlyMap<string, string>;
}
