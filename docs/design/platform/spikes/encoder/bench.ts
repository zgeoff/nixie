/* oxlint-disable max-statements, no-await-in-loop -- a throwaway spike that times one candidate */
// Runs one candidate in a fresh process and prints one JSON line: load time, RSS, embedding times
// and recall on both question sets. run.ts spawns one process per candidate so each peak RSS is its
// own.
import { CANDIDATES } from './candidates.ts';
import { ITEMS } from '../memory-retrieval/items.ts';
import { loadEncoder } from './load-encoder.ts';
import type { Embed } from './load-encoder.ts';
import { DISTRACTORS, PAIRS } from './pairs.ts';
import { QUESTIONS } from '../memory-retrieval/questions.ts';

const candidate = CANDIDATES.find((entry) => entry.id === process.argv[2]);
if (!candidate) {
  throw new Error(`unknown candidate ${process.argv[2]}`);
}

const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024);
const rssBase = process.memoryUsage().rss;
const loadStart = performance.now();
const embed = await loadEncoder(candidate);
const loadMs = performance.now() - loadStart;
const rssLoaded = process.memoryUsage().rss;

const toDocs = (texts: string[]): string[] => texts.map((text) => candidate.docPrefix + text);
const toQueries = (texts: string[]): string[] => texts.map((text) => candidate.queryPrefix + text);

// warm the session so the first call's allocation stays out of the timings
await embed(toQueries(['warm up the session']));
await embed(toDocs(ITEMS.slice(0, 32).map((item) => item.text)));

// single texts, one call each: the per-turn query path
const singles = toQueries(QUESTIONS.slice(0, 50).map((question) => question.message));
const singleTimes: number[] = [];
for (const text of singles) {
  const start = performance.now();
  await embed([text]);
  singleTimes.push(performance.now() - start);
}

// stored texts in batches of 32: the rebuild path
const corpus = toDocs([...ITEMS.map((item) => item.text), ...PAIRS.map((pair) => pair.memory), ...DISTRACTORS]);
const batchStart = performance.now();
const corpusVectors = await embedInBatches(embed, corpus, 32);
const batchMs = performance.now() - batchStart;

// recall@5 on the 30 pairs, over the 30 memories and 50 distractors
const pairOffset = ITEMS.length;
const pairCorpus = corpusVectors.slice(pairOffset);
const pairQueries = await embedInBatches(embed, toQueries(PAIRS.map((pair) => pair.query)), 32);
const pairHits = PAIRS.map((pair, index) => {
  const ranked = rankVectors(pairQueries[index] as Float32Array, pairCorpus);
  return ranked.slice(0, 5).includes(index);
});

// recall@5 and MRR on the 75 questions over the 276 items from the retrieval spike
const itemVectors = corpusVectors.slice(0, ITEMS.length);
const itemIDs = ITEMS.map((item) => item.id);
const messageVectors = await embedInBatches(embed, toQueries(QUESTIONS.map((question) => question.message)), 32);
const keywordVectors = await embedInBatches(embed, toQueries(QUESTIONS.map((question) => question.keywords)), 32);
const scoreQuestions = (vectors: Float32Array[]): { recall: number; mrr: number } => {
  let recall = 0,
    mrr = 0;
  QUESTIONS.forEach((question, index) => {
    const ranked = rankVectors(vectors[index] as Float32Array, itemVectors).map((row) => itemIDs[row]);
    const found = question.gold.filter((id) => ranked.slice(0, 5).includes(id)).length;
    recall += found / question.gold.length;
    const first = ranked.findIndex((id) => question.gold.includes(id as string));
    mrr += first === -1 ? 0 : 1 / (first + 1);
  });
  return { mrr: mrr / QUESTIONS.length, recall: recall / QUESTIONS.length };
};
const message = scoreQuestions(messageVectors);
const keywords = scoreQuestions(keywordVectors);

const sorted = singleTimes.toSorted((left, right) => left - right);
console.log(
  JSON.stringify({
    batchMsPerItem: batchMs / corpus.length,
    dims: corpusVectors[0]?.length,
    id: candidate.id,
    loadMs,
    pairRecall: pairHits.filter(Boolean).length / PAIRS.length,
    pairRecallLexical: countHits(pairHits, 'lexical'),
    pairRecallParaphrase: countHits(pairHits, 'paraphrase'),
    pairMisses: PAIRS.filter((_, index) => !pairHits[index]).map((pair) => pair.id),
    questionsKeywords: keywords,
    questionsMessage: message,
    rssBaseMB: mb(rssBase),
    rssLoadedMB: mb(rssLoaded),
    rssPeakMB: Math.round(process.resourceUsage().maxRSS / 1024),
    singleMsMedian: sorted[Math.floor(sorted.length / 2)],
    singleMsP90: sorted[Math.floor(sorted.length * 0.9)],
    threads: Number(process.env.THREADS ?? 0),
  }),
);
process.exit(0);

async function embedInBatches(encode: Embed, texts: string[], size: number): Promise<Float32Array[]> {
  const rows: Float32Array[] = [];
  for (let start = 0; start < texts.length; start += size) {
    rows.push(...(await encode(texts.slice(start, start + size))));
  }
  return rows;
}

function rankVectors(query: Float32Array, rows: Float32Array[]): number[] {
  return rows
    .map((row, index) => ({ index, score: getDot(query, row) }))
    .toSorted((left, right) => right.score - left.score)
    .map((hit) => hit.index);
}

function getDot(left: Float32Array, right: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function countHits(hits: boolean[], type: 'lexical' | 'paraphrase'): string {
  const rows = PAIRS.map((pair, index) => ({ hit: hits[index], type: pair.type })).filter((row) => row.type === type);
  return `${rows.filter((row) => row.hit).length}/${rows.length}`;
}
