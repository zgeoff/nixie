import type { IndexEntry } from './start-memory-index';
import type { Encoder } from './types';

export interface VectorMatch {
  readonly itemID: string;
  readonly similarity: number;
}

interface VectorMatchOptions {
  readonly limit: number;

  readonly minSimilarity: number;

  readonly excludedIDs?: readonly string[];
}

export interface VectorIndex {
  readonly rebuild: (entries: readonly IndexEntry[]) => Promise<boolean>;

  readonly update: (entry: IndexEntry) => void;

  readonly remove: (itemID: string) => void;

  readonly readMatches: (
    query: string,
    options: VectorMatchOptions,
  ) => Promise<readonly VectorMatch[] | null>;

  readonly isReady: () => boolean;

  readonly waitForIdle: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

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

// The index lives only in process memory, so a forgotten item's vector never outlives the process.
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
    readMatches: (query, options) => readVectorMatches(state, query, options),
    isReady: () => state.isReady,
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

const batchSize = 32;

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

function updateGeneration(state: VectorState, itemID: string): number {
  const generation = state.nextGeneration;

  state.nextGeneration += 1;

  state.generations.set(itemID, generation);
  state.vectors.delete(itemID);

  return generation;
}

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

interface StampedEntry extends IndexEntry {
  readonly generation: number;
}

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

// The encoder's model is trained so that its first numbers carry most of a vector's meaning.
const storedWidth = 256;
const storedRange = 0.3;
const int8Max = 127;

function toStoredVector(vector: Float32Array): Int8Array {
  const cut = vector.slice(0, storedWidth);
  const norm = Math.hypot(...cut) || 1;

  return Int8Array.from(cut, (value) =>
    Math.round(Math.max(-1, Math.min(1, value / norm / storedRange)) * int8Max),
  );
}

async function readVectorMatches(
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

function buildSimilarity(first: Int8Array, second: Int8Array): number {
  let sum = 0;

  for (const [index, value] of first.entries()) {
    sum += value * (second[index] ?? 0);
  }

  return sum * (storedRange / int8Max) ** 2;
}
