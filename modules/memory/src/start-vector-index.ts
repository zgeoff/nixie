// oxlint-disable typescript/prefer-readonly-parameter-types -- the index's own mutable state, and typed arrays, which have no readonly form
import type { IndexEntry } from './start-memory-index';
import type { Encoder } from './types';

// A match of the vector index: the item and the similarity of its vector to the query's, about -1
// to 1, higher is better.
export interface VectorMatch {
  readonly itemID: string;
  readonly similarity: number;
}

interface VectorMatchOptions {
  readonly limit: number;

  // drops a match whose similarity falls below it
  readonly minSimilarity: number;

  // leaves these items out before the limit applies
  readonly excludedIDs?: readonly string[];
}

// The semantic index of active memory items: one vector per item, cut to its first numbers and
// stored as int8. It ranks item IDs and never holds or supplies text.
export interface VectorIndex {
  // empties the index and encodes every entry again; true once it ends, false when an encoding
  // failed or the index stopped, which leaves search on keywords
  readonly rebuild: (entries: readonly IndexEntry[]) => Promise<boolean>;

  // drops the item's vector and queues its current text for encoding
  readonly update: (entry: IndexEntry) => void;

  // drops the item's vector and discards any queued encoding of it
  readonly remove: (itemID: string) => void;

  // the items whose similarity clears the floor, best first, none for a blank query, or null while
  // a rebuild runs, when search falls back to keywords
  readonly findMatches: (
    query: string,
    options: VectorMatchOptions,
  ) => Promise<readonly VectorMatch[] | null>;

  // resolves once every queued encoding has ended
  readonly waitForIdle: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

// Starts an empty vector index in process memory, so a forgotten item's vector never outlives the
// process. Encodings run one at a time, and an encoding that ends after a newer change to its item
// is discarded.
export function startVectorIndex(encoder: Encoder, onError: (error: unknown) => void): VectorIndex {
  const state: VectorState = {
    encoder,
    onError,
    vectors: new Map(),
    generations: new Map(),
    nextGeneration: 1,
    isReady: false,
    isStopped: false,
    tail: Promise.resolve(true),
  };

  return {
    rebuild: (entries) => runRebuild(state, entries),
    update: (entry) => {
      const generation = updateGeneration(state, entry.itemID);

      void runQueuedEncoding(state, () => updateVectors(state, [{ ...entry, generation }]));
    },
    remove: (itemID) => {
      updateGeneration(state, itemID);
    },
    findMatches: (query, options) => findVectorMatches(state, query, options),
    waitForIdle: async () => {
      await state.tail;
    },
    stop: async () => {
      state.isStopped = true;
      state.isReady = false;

      await state.tail;

      state.vectors.clear();
    },
  };
}

// The index's mutable state. Each item keeps a generation that every change raises, and the queue's
// tail settles once the last queued encoding ends; it never rejects.
interface VectorState {
  readonly encoder: Encoder;
  readonly onError: (error: unknown) => void;
  readonly vectors: Map<string, Int8Array>;
  readonly generations: Map<string, number>;
  nextGeneration: number;
  isReady: boolean;
  isStopped: boolean;
  tail: Promise<boolean>;
}

interface StampedEntry extends IndexEntry {
  readonly generation: number;
}

async function runRebuild(state: VectorState, entries: readonly IndexEntry[]): Promise<boolean> {
  state.isReady = false;

  state.vectors.clear();

  const stamped = entries.map((entry) => ({
    ...entry,
    generation: updateGeneration(state, entry.itemID),
  }));

  const batches = Array.from({ length: Math.ceil(stamped.length / batchSize) }, (_, index) =>
    stamped.slice(index * batchSize, (index + 1) * batchSize),
  );

  const results = await Promise.all(
    batches.map((batch) => runQueuedEncoding(state, () => updateVectors(state, batch))),
  );

  state.isReady = !state.isStopped && results.every(Boolean);

  return state.isReady;
}

// the items a rebuild hands the encoder at once, so a write's encoding waits behind one group at
// most and a stop ends the rebuild within one group
const batchSize = 32;

// raises the item's generation and drops its vector, so an encoding already queued for it is
// discarded when it ends
function updateGeneration(state: VectorState, itemID: string): number {
  const generation = state.nextGeneration;

  state.nextGeneration += 1;

  state.generations.set(itemID, generation);
  state.vectors.delete(itemID);

  return generation;
}

// Runs the task after every encoding queued before it, and resolves false when the index stopped
// first or the task failed, whose error goes to onError.
function runQueuedEncoding(state: VectorState, task: () => Promise<void>): Promise<boolean> {
  const run = runAfter(state, state.tail, task);

  state.tail = run;

  return run;
}

async function runAfter(
  state: VectorState,
  previous: Promise<boolean>,
  task: () => Promise<void>,
): Promise<boolean> {
  await previous;

  if (state.isStopped) {
    return false;
  }

  try {
    await task();

    return true;
  } catch (error) {
    state.onError(error);

    return false;
  }
}

// encodes the entries whose generation still matches, and keeps each vector whose generation still
// matches once the encoding ends
async function updateVectors(state: VectorState, entries: readonly StampedEntry[]): Promise<void> {
  const current = entries.filter((entry) => isCurrent(state, entry));

  if (current.length === 0) {
    return;
  }

  const texts = current.map((entry) => entry.text);

  const encoded = await state.encoder.encode(texts, 'document');

  for (const [index, entry] of current.entries()) {
    const vector = encoded[index];

    if (vector !== undefined && isCurrent(state, entry)) {
      state.vectors.set(entry.itemID, toStoredVector(vector));
    }
  }
}

function isCurrent(state: VectorState, entry: StampedEntry): boolean {
  return state.generations.get(entry.itemID) === entry.generation;
}

async function findVectorMatches(
  state: VectorState,
  query: string,
  options: VectorMatchOptions,
): Promise<readonly VectorMatch[] | null> {
  if (!state.isReady) {
    return null;
  }

  if (query.trim() === '') {
    return [];
  }

  const [encoded] = await state.encoder.encode([query], 'query');

  if (encoded === undefined) {
    return [];
  }

  const target = toStoredVector(encoded);

  const excluded = new Set(options.excludedIDs);

  return [...state.vectors]
    .filter(([itemID]) => !excluded.has(itemID))
    .map(([itemID, vector]) => ({ itemID, similarity: buildSimilarity(target, vector) }))
    .filter((match) => match.similarity >= options.minSimilarity)
    .toSorted((first, second) => second.similarity - first.similarity)
    .slice(0, options.limit);
}

// the numbers each stored vector keeps; the encoder's model was trained so its first numbers carry
// most of a vector's meaning
const storedWidth = 256;

// the range each number of a unit vector maps onto the int8 range, as the encoder spike stored it
const storedRange = 0.3;
const int8Max = 127;

// cuts a vector to its first numbers, normalises it again, and maps each number from the stored
// range onto the int8 range
function toStoredVector(vector: Float32Array): Int8Array {
  const cut = vector.slice(0, storedWidth);
  const norm = Math.hypot(...cut) || 1;

  return Int8Array.from(cut, (value) =>
    Math.round(Math.max(-1, Math.min(1, value / norm / storedRange)) * int8Max),
  );
}

// the dot product of two stored vectors, scaled back to the unit range, which for unit vectors is
// their cosine similarity less the rounding
function buildSimilarity(first: Int8Array, second: Int8Array): number {
  let sum = 0;

  for (const [index, value] of first.entries()) {
    sum += value * (second[index] ?? 0);
  }

  return sum * (storedRange / int8Max) ** 2;
}
