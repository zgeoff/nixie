export interface ItemUsage {
  // how many recalled records of each kind named the item
  readonly searched: number;
  readonly pushed: number;

  // the time of the newest record that named the item as a search hit or a push
  readonly lastSurfacedAtMs: number | null;

  // the time of the newest recall by ID that returned the item
  readonly lastRecalledByIDAtMs: number | null;

  // the keys of the trigger phrases that placed the item in a push
  readonly firedTriggers: readonly string[];

  // true when a push placed the item and its record names no phrase, so no phrase can be ruled out
  readonly hasUnkeyedPush: boolean;
}

export interface MemoryUsage {
  readonly items: ReadonlyMap<string, ItemUsage>;

  // the time of the earliest record the counts come from, null with no record
  readonly earliestAtMs: number | null;
}

// What an item's usage line shows: its counts, and the date they start from when the item was
// saved before the log's first usage record.
export interface ItemUsageReport extends ItemUsage {
  readonly sinceMs: number | null;
}

// One `memory.recalled` record, reduced to what the usage counts read.
export interface RecalledEntry {
  readonly sequence: number;
  readonly thread: string | null;
  readonly recordedAtMs: number;
  readonly itemIDs: readonly string[];

  // the trigger keys that a push record names for each item it placed; an item the record names no
  // key for has no entry
  readonly triggers: ReadonlyMap<string, readonly string[]>;

  // a record of a search names its mode, and so does a record of a push
  readonly hasSearchMode: boolean;
  readonly isTurnNote: boolean;
}

// One `memory.recall` call, with the span its records fall in.
export interface RecallCallEntry {
  readonly sequence: number;
  readonly thread: string | null;

  // the sequence where the call's span ends: its result, or else the first record on its thread
  // that is no recalled record, or null for a call that is the newest record of its thread
  readonly endSequence: number | null;

  // the recorded input leaves the query out, so a call that names no items is a search, a list or a
  // topic read
  readonly kind: 'ids' | 'other';
}
