/* oxlint-disable max-statements, no-await-in-loop, one-var, sort-vars -- a throwaway spike that runs each model in turn */
// Compares keyword search, FTS5 with BM25 ranking, vectors, and BM25 fused with vectors over the
// synthetic memory items, then times an in-memory FTS5 index over a synthetic event log.
import { Database } from 'bun:sqlite';
import { pipeline } from '@huggingface/transformers';
import { ITEMS } from './items.ts';
import { QUESTIONS } from './questions.ts';
import type { Question, QuestionType } from './questions.ts';

const STOP = new Set(
  (
    'a an and are as at be but by can do does did for from get got had has have how i i’m im in ' +
    'is it its me my of on or our so than that the their them they this to was we were what ' +
    "what's whats when where which who whose why will with you your again remind tell know " +
    'should us any all there up out about still this'
  ).split(' '),
);

function splitTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replaceAll(/[’']s\b/gu, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 1 && !STOP.has(term)),
    ),
  ];
}

type Ranker = (query: string) => string[];

// grep-like: count the distinct query terms that occur as substrings of the item
function buildKeywordRanker(): Ranker {
  const lowered = ITEMS.map((item) => ({ id: item.id, text: item.text.toLowerCase() }));
  return (query) => {
    const queryTerms = splitTerms(query);
    return lowered
      .map((item) => ({
        id: item.id,
        score: queryTerms.filter((term) => item.text.includes(term)).length,
      }))
      .filter((hit) => hit.score > 0)
      .toSorted((left, right) => right.score - left.score)
      .map((hit) => hit.id);
  };
}

function buildFtsRanker(db: Database): Ranker {
  const statement = db.query<{ id: string }, [string]>(
    'select id from items where items match ? order by bm25(items) limit 50',
  );
  return (query) => {
    const queryTerms = splitTerms(query);
    if (queryTerms.length === 0) {
      return [];
    }
    return statement.all(queryTerms.map((term) => `"${term}"`).join(' OR ')).map((row) => row.id);
  };
}

function buildFts(): { db: Database; ms: number; bytes: number } {
  const start = performance.now(),
    db = new Database(':memory:');
  db.run("create virtual table items using fts5(id unindexed, text, tokenize='porter unicode61')");
  const insert = db.prepare('insert into items (id, text) values (?, ?)');
  db.transaction(() => {
    for (const item of ITEMS) {
      insert.run(item.id, item.text);
    }
  })();
  const ms = performance.now() - start,
    pages = db
      .query<{ n: number }, []>(
        'select page_count * page_size as n from pragma_page_count, pragma_page_size',
      )
      .get();
  return { bytes: pages?.n ?? 0, db, ms };
}

type Embed = (texts: string[]) => Promise<Float32Array[]>;

async function loadEmbedder(model: string): Promise<{ embed: Embed; loadMs: number }> {
  const start = performance.now(),
    extractor = await pipeline('feature-extraction', model, { dtype: 'fp32' });
  const encodeTexts: Embed = async (texts) => {
    const output = await extractor(texts, { normalize: true, pooling: 'mean' }),
      [rows, dims] = output.dims as [number, number],
      data = output.data as Float32Array;
    return Array.from({ length: rows }, (_, row) => data.slice(row * dims, (row + 1) * dims));
  };
  return { embed: encodeTexts, loadMs: performance.now() - start };
}

function getDot(left: Float32Array, right: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function buildVectorRanker(
  itemVectors: Float32Array[],
  queryVectors: Map<string, Float32Array>,
): Ranker {
  return (query) => {
    const queryVector = queryVectors.get(query);
    if (!queryVector) {
      throw new Error(`no vector for ${query}`);
    }
    return itemVectors
      .map((vector, index) => ({ id: ITEMS[index]?.id ?? '', score: getDot(vector, queryVector) }))
      .toSorted((left, right) => right.score - left.score)
      .slice(0, 50)
      .map((hit) => hit.id);
  };
}

// reciprocal rank fusion with the usual constant of 60
function buildFused(first: Ranker, second: Ranker): Ranker {
  return (query) => {
    const scores = new Map<string, number>();
    for (const ranking of [first(query), second(query)]) {
      for (const [rank, id] of ranking.entries()) {
        scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1));
      }
    }
    return [...scores.entries()].toSorted((left, right) => right[1] - left[1]).map(([id]) => id);
  };
}

interface Score {
  r5: number;
  r10: number;
  mrr: number;
}

function getScore(ranking: string[], gold: string[]): Score {
  const countHits = (k: number): number =>
      gold.filter((id) => ranking.slice(0, k).includes(id)).length / gold.length,
    first = ranking.findIndex((id) => gold.includes(id));
  return { mrr: first === -1 ? 0 : 1 / (first + 1), r10: countHits(10), r5: countHits(5) };
}

function getMean(scores: Score[]): Score {
  const total = scores.reduce(
    (sum, item) => ({ mrr: sum.mrr + item.mrr, r10: sum.r10 + item.r10, r5: sum.r5 + item.r5 }),
    { mrr: 0, r10: 0, r5: 0 },
  );
  return {
    mrr: total.mrr / scores.length,
    r10: total.r10 / scores.length,
    r5: total.r5 / scores.length,
  };
}

const TYPES: QuestionType[] = ['lexical', 'paraphrase', 'latest', 'multi'],
  FORMS = ['message', 'keywords'] as const;

function printScores(name: string, rank: Ranker): void {
  for (const form of FORMS) {
    const rows: string[] = [],
      all: Score[] = [];
    for (const type of TYPES) {
      const scores = QUESTIONS.filter((question) => question.type === type).map(
        (question: Question) => getScore(rank(question[form]), question.gold),
      );
      all.push(...scores);
      const result = getMean(scores);
      rows.push(
        `${type} ${result.r5.toFixed(2)}/${result.r10.toFixed(2)}/${result.mrr.toFixed(2)}`,
      );
    }
    const overall = getMean(all);
    console.log(
      `${name.padEnd(14)} ${form.padEnd(8)} all ${overall.r5.toFixed(2)}/${overall.r10.toFixed(2)}/${overall.mrr.toFixed(2)}  ${rows.join('  ')}`,
    );
  }
}

function getQueryTime(rank: Ranker): number {
  const start = performance.now();
  for (const question of QUESTIONS) {
    rank(question.message);
  }
  return (performance.now() - start) / QUESTIONS.length;
}

// a synthetic event log of owner messages and replies, for index build time at log scale
const WORDS = ITEMS.flatMap((item) => item.text.split(/\s+/u));

function buildLogMessages(count: number): string[] {
  let seed = 7;
  const getNext = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 12 + (getNext() % 60) }, () => WORDS[getNext() % WORDS.length]).join(' '),
  );
}

function runLogIndex(count: number): void {
  const messages = buildLogMessages(count),
    rssBefore = process.memoryUsage().rss,
    start = performance.now(),
    db = new Database(':memory:');
  db.run("create virtual table log using fts5(text, tokenize='porter unicode61')");
  const insert = db.prepare('insert into log (text) values (?)');
  db.transaction(() => {
    for (const message of messages) {
      insert.run(message);
    }
  })();
  const buildMs = performance.now() - start,
    size = db
      .query<{ n: number }, []>(
        'select page_count * page_size as n from pragma_page_count, pragma_page_size',
      )
      .get(),
    query = db.query<{ rowid: number }, [string]>(
      'select rowid from log where log match ? order by bm25(log) limit 10',
    ),
    queryStart = performance.now();
  for (const question of QUESTIONS) {
    const queryTerms = splitTerms(question.message);
    if (queryTerms.length > 0) {
      query.all(queryTerms.map((term) => `"${term}"`).join(' OR '));
    }
  }
  const queryMs = (performance.now() - queryStart) / QUESTIONS.length,
    textBytes = messages.reduce((sum, message) => sum + message.length, 0);
  console.log(
    `log ${count} messages, ${(textBytes / 1e6).toFixed(1)} MB text: build ${buildMs.toFixed(0)} ms, index ${((size?.n ?? 0) / 1e6).toFixed(1)} MB, rss +${((process.memoryUsage().rss - rssBefore) / 1e6).toFixed(0)} MB, query ${queryMs.toFixed(2)} ms`,
  );
  db.close();
}

const known = new Set(ITEMS.map((item) => item.id));
for (const question of QUESTIONS) {
  for (const id of question.gold) {
    if (!known.has(id)) {
      throw new Error(`unknown gold item ${id}`);
    }
  }
}

const keyword = buildKeywordRanker(),
  fts = buildFts(),
  bm25 = buildFtsRanker(fts.db);
console.log(
  `${ITEMS.length} items, ${QUESTIONS.length} questions; scores are recall@5/recall@10/MRR`,
);
console.log(
  `fts5 build ${fts.ms.toFixed(1)} ms for ${ITEMS.length} items, ${(fts.bytes / 1024).toFixed(0)} KB`,
);
printScores('keyword', keyword);
printScores('fts5-bm25', bm25);

const models = (process.env.MODELS ?? 'Xenova/all-MiniLM-L6-v2,Xenova/bge-small-en-v1.5').split(
  ',',
);
for (const model of models.filter(Boolean)) {
  const embedder = await loadEmbedder(model),
    itemStart = performance.now(),
    itemVectors = await embedder.embed(ITEMS.map((item) => item.text)),
    perItem = (performance.now() - itemStart) / ITEMS.length,
    queries = [...new Set(QUESTIONS.flatMap((question) => [question.message, question.keywords]))],
    queryStart = performance.now(),
    queryVectors = await embedder.embed(queries),
    perQuery = (performance.now() - queryStart) / queries.length,
    vectors = buildVectorRanker(
      itemVectors,
      new Map(queries.map((query, index) => [query, queryVectors[index] ?? new Float32Array()])),
    ),
    short = model.split('/').at(-1) ?? model;
  console.log(
    `${short}: load ${embedder.loadMs.toFixed(0)} ms, ${perItem.toFixed(1)} ms per item in one batch, ${perQuery.toFixed(1)} ms per query`,
  );
  printScores(`vec ${short.slice(0, 10)}`, vectors);
  printScores(`rrf ${short.slice(0, 10)}`, buildFused(bm25, vectors));
}

console.log(
  `query time per question: keyword ${getQueryTime(keyword).toFixed(2)} ms, fts5 ${getQueryTime(bm25).toFixed(2)} ms`,
);
for (const count of [2000, 20_000]) {
  runLogIndex(count);
}
