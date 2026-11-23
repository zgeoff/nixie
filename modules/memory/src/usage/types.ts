export interface ItemUsage {
  // how many recalled records of each kind named the item
  readonly searched: number;
  readonly pushed: number;

  // the time of the newest record that named the item as a search hit or a push
  readonly lastSurfacedAtMs: number | null;

  // the time of the newest recall by ID that returned the item
  readonly lastRecalledByIDAtMs: number | null;
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

  // a record of a search names its mode, and so does a record of a push
  readonly hasSearchMode: boolean;
  readonly isTurnNote: boolean;
}

// One `memory.recall` call, with the span its records fall in.
export interface RecallCallEntry {
  readonly sequence: number;
  readonly thread: string | null;

  // the sequence of the call's result, null while the call runs
  readonly resultSequence: number | null;

  // the recorded input leaves the query out, so a call that names no items is a search, a list or a
  // topic read
  readonly kind: 'ids' | 'other';
}
