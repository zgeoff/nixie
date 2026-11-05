/* oxlint-disable max-statements, no-await-in-loop -- a spike that runs each turn and setting in turn */
// Measures per-turn retrieval on a deployment's own conversations. It reads the plain export of a data
// directory, rebuilds each turn, and prints counts and scores only, never a message or an item.
//
//   bun real-turns.ts stats  --plain <dir>
//   bun real-turns.ts blocks --plain <dir>
//   bun real-turns.ts replay --plain <dir> [--names <file>]
//   bun real-turns.ts sample --plain <dir> --out <file> [--size <n>]
//   bun real-turns.ts rating-sample --plain <dir> --out <dir> [--size <n>] [--names <file>]
//   bun real-turns.ts cases  --plain <dir> --labels <file> --key <file> --sample <file> --out <file>
//   bun real-turns.ts score  --plain <dir> [--labels <file> --key <file> --sample <file>] [--names <file>] [--encoders <a,b>]
//                            [--exclude <ranges>] [--held <ranges>] [--missing <file>] [--out <file>]
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { TurnCase } from './real-turns/build-turn-cases.ts';
import type { BuiltGold, SampleKey } from './real-turns/build-gold.ts';
import { buildGold } from './real-turns/build-gold.ts';
import { buildKeyPath } from './real-turns/build-key-path.ts';
import { buildTurnCases } from './real-turns/build-turn-cases.ts';
import type { BlockSources } from './real-turns/build-block-tokens.ts';
import { buildBlockTokens } from './real-turns/build-block-tokens.ts';
import { collectBlockSources } from './real-turns/collect-block-sources.ts';
import { countWords } from './real-turns/count-words.ts';
import { collectSessionHeld } from './real-turns/collect-session-held.ts';
import { buildTurnTokens } from './real-turns/build-turn-tokens.ts';
import { buildBlockSummary } from './real-turns/build-block-summary.ts';
import type { EncoderName } from './real-turns/load-turn-encoder.ts';
import { ENCODERS, loadTurnEncoder } from './real-turns/load-turn-encoder.ts';
import { buildSample, sampleTurnSchema } from './real-turns/build-sample.ts';
import { pickCurrentLabels } from './real-turns/pick-current-labels.ts';
import { parseEncoderNames } from './real-turns/parse-encoder-names.ts';
import { readPlainExport } from './real-turns/read-plain-export.ts';
// @boundaries-ignore a spike imports the code it measures
import { startMemoryIndex } from '../../modules/memory/src/start-memory-index.ts';
import { type BackgroundMessage, buildRanker, SHIPPED } from './real-turns/rank-turn.ts';
import { readJSONLines } from './real-turns/read-json-lines.ts';
import { buildTurnReport } from './real-turns/build-turn-report.ts';
import { pickScoredTurns } from './real-turns/pick-scored-turns.ts';
import type { Gold, Label } from './real-turns/score-turns.ts';
import { buildRuns, labelSchema, missingMapSchema, runRankings, sampleKeySchema } from './real-turns/score-turns.ts';
import { buildRatingSample } from './real-turns/build-rating-sample.ts';
import { collectRatingPools } from './real-turns/collect-rating-pools.ts';
import { pickPooledRuns } from './real-turns/pick-pooled-runs.ts';
import { collectIndexedMessages } from './real-turns/collect-indexed-messages.ts';
import { pickRatingTurns } from './real-turns/pick-rating-turns.ts';
import { renderRatingParts } from './real-turns/render-rating-parts.ts';
import { parseLabelLines } from './real-turns/parse-label-lines.ts';
import { readRatedMessages } from './real-turns/read-rated-messages.ts';
import { collectExchangeItems } from './real-turns/collect-exchange-items.ts';
import { countMissedItems } from './real-turns/count-missed-items.ts';
import { isMetaTurn } from './real-turns/is-meta-turn.ts';
import { isInCaseRanges } from './real-turns/is-in-case-ranges.ts';
import { parseCaseRangesOption } from './real-turns/parse-case-ranges-option.ts';
import { pickLabelFiles } from './real-turns/pick-label-files.ts';
import { pickKeptLabels } from './real-turns/pick-kept-labels.ts';
import { messageKeyPrefix } from './real-turns/build-rating-sample.ts';
// @boundaries-ignore a spike imports the code it measures
import { buildVectorQuery } from '../../modules/memory/src/build-vector-query.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    plain: { type: 'string' },
    names: { type: 'string' },
    out: { type: 'string' },
    labels: { type: 'string' },
    key: { type: 'string' },
    sample: { type: 'string' },
    size: { type: 'string' },
    encoders: { type: 'string' },
    exclude: { type: 'string' },
    held: { type: 'string' },
    missing: { type: 'string' },
  },
});

const repoRoot = resolve(import.meta.dir, '../..');

// A message of at most this many words counts as short in the reports.
const shortWords = 3;

// The open ranking's top places join the rating pool, so a needed item that no setting shows still
// gets rated, and fresh recall has a count of needed items to divide by.
const poolTopPlaces = 5;
const turnsPerPart = 15;
const heldOutSeed = 4716;

const encoderDirs = {
  shipped: join(repoRoot, 'node_modules/.cache/nixie-encoder'),
  models: resolve(process.env['MODELS_DIR'] ?? join(repoRoot, '.scratch/models')),
};

if (values.plain === undefined) {
  throw new Error('pass --plain <dir>, the folder an export of the data directory wrote');
}

const exported = await readPlainExport(resolve(values.plain));
const cases = buildTurnCases(exported);
const excludedWords = values.names === undefined ? [] : await readNames(values.names);
const command = positionals[0];

if (command === 'stats') {
  printStats(cases);
} else if (command === 'blocks') {
  printBlocks(cases, collectBlockSources(exported));
} else if (command === 'replay') {
  await runReplay(cases.filter((turn) => turn.searchMode === 'hybrid'));
} else if (command === 'sample') {
  await writeSample(cases);
} else if (command === 'rating-sample') {
  await writeRatingSample(cases);
} else if (command === 'score') {
  await runScore(cases);
} else if (command === 'cases') {
  await writeTestSet(cases);
} else {
  throw new Error(`unknown command ${command ?? '(none)'}`);
}

async function readNames(path: string): Promise<string[]> {
  return (await Bun.file(path).text())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function printStats(turns: TurnCase[]): void {
  const hybrid = turns.filter((turn) => turn.searchMode === 'hybrid');

  console.log({
    turns: turns.length,
    hybridTurns: hybrid.length,
    hybridWithItems: hybrid.filter((turn) => turn.logged.length > 0).length,
    hybridWithDelivered: hybrid.filter((turn) => turn.delivered.length > 0).length,
    ratedTurns: turns.filter((turn) => turn.ratings.length > 0).length,
    ratings: turns.reduce((sum, turn) => sum + turn.ratings.length, 0),
    meanCandidates: mean(turns.map((turn) => turn.candidates.length)),
    meanQueryChars: mean(turns.map((turn) => turn.query.length)),
  });
}

// A block stays in the session once given, and a compaction does not reset the count a session
// holds, so that count is an upper bound.
function printBlocks(turns: TurnCase[], sources: BlockSources): void {
  const lines = { ownerName: null, defaultZone: 'UTC' };
  const blocks = turns.map((turn) => ({ turn, tokens: buildBlockTokens(turn, sources, lines) }));
  const sessionHeld = collectSessionHeld(blocks.map(({ turn, tokens }) => buildTurnTokens(turn, tokens, sources, lines)));
  const counted = blocks.map((entry, position) => ({ ...entry, sessionHeld: sessionHeld[position] ?? 0 }));

  console.log(
    JSON.stringify(
      {
        all: buildBlockSummary(counted),
        short: buildBlockSummary(counted.filter((entry) => countWords(entry.turn.query) <= shortWords)),
        hybrid: buildBlockSummary(counted.filter((entry) => entry.turn.searchMode === 'hybrid')),
      },
      null,
      2,
    ),
  );
}

async function runReplay(turns: TurnCase[]): Promise<void> {
  const encoder = await loadTurnEncoder('leaf-ir-q8' satisfies EncoderName, encoderDirs);
  const index = await startMemoryIndex();
  const ranker = buildRanker(encoder, index);
  const counts = { turns: turns.length, logMatches: 0, logMismatches: 0, withItems: 0, withItemsMatches: 0, harnessMatches: 0, harnessMismatches: 0 };
  const mismatched: string[] = [];

  for (const turn of turns) {
    const product = await ranker.rankWithProduct(turn, excludedWords);
    const harness = await ranker.rankTurn(turn, SHIPPED, excludedWords);
    const replayed = [...product.facts, ...product.selves].toSorted().join(',');
    const logged = turn.logged.map((item) => item.itemID).toSorted().join(',');

    if (turn.logged.length > 0) {
      counts.withItems += 1;
      counts.withItemsMatches += replayed === logged ? 1 : 0;
    }

    if (replayed === logged) {
      counts.logMatches += 1;
    } else {
      counts.logMismatches += 1;
      mismatched.push(turn.caseID);
    }

    if (product.facts.join(',') === harness.facts.join(',') && product.selves.join(',') === harness.selves.join(',')) {
      counts.harnessMatches += 1;
    } else {
      counts.harnessMismatches += 1;
    }
  }

  console.log(counts);
  console.log(`mismatched cases: ${mismatched.join(' ')}`);

  await index.stop();
  await encoder.stop();
}

async function runScore(turns: TurnCase[]): Promise<void> {
  const read = values.labels === undefined ? { labels: [], keys: [] } : await readLabels(turns);
  const picked = pickKeptLabels(read.labels, turns, parseCaseRangesOption(values.exclude));
  const labels = picked.kept;
  const keptCases = new Set(labels.map((label) => label.caseID));
  const keys = read.keys;
  const pooledByCase = new Map(
    keys.map((entry) => [entry.caseID, new Set(Object.values(entry.refs).filter((key) => !key.startsWith(messageKeyPrefix)))]),
  );
  const heldRanges = parseCaseRangesOption(values.held);
  const missing = (values.missing === undefined ? [] : await readJSONLines(resolve(values.missing), missingMapSchema)).filter((entry) =>
    keptCases.has(entry.caseID),
  );
  const hybrid = turns.filter((turn) => turn.searchMode === 'hybrid');
  const exchangeItems = collectExchangeItems(turns, exported.versions);
  const gold = getGold(
    buildGold(turns, labels, keys, {
      missing,
      heldCases: new Set([...keptCases].filter((caseID) => isInCaseRanges(caseID, heldRanges))),
      heldItems: exchangeItems,
    }),
  );

  console.log({
    metaTurns: {
      hybridFlagged: hybrid.filter((turn) => isMetaTurn(turn)).length,
      labelsInRange: picked.inRange,
      labelsFlagged: picked.flagged,
      labelsBoth: picked.both,
      labelsShredded: picked.shredded,
      labelsKept: labels.length,
    },
    missing: countMissedItems(
      turns,
      missing,
      pooledByCase,
      new Map([...gold].map(([caseID, expected]) => [caseID, expected.delivered])),
    ),
    descriptions: labels.reduce((sum, label) => sum + (label.missing?.length ?? 0), 0),
    turnsWithDescriptions: labels.filter((label) => (label.missing?.length ?? 0) > 0).length,
    labelledWithExchangeItems: labels.filter((label) => exchangeItems.has(label.caseID)).length,
  });
  const encoders = parseEncoderNames(values.encoders ?? 'leaf-ir-q8');

  if ('unknown' in encoders) {
    throw new Error(`unknown encoders ${encoders.unknown.join(', ')}; pass any of ${Object.keys(ENCODERS).join(', ')}`);
  }

  const chosen = pickScoredTurns(turns, labels);
  const runs = buildRuns(encoders.names);
  const results = await runRankings(
    chosen,
    runs,
    { loadEncoder: (name) => loadTurnEncoder(name, encoderDirs), startIndex: startMemoryIndex },
    excludedWords,
    collectBackgroundMessages(hybrid),
  );
  const messageEncoder = await loadTurnEncoder('leaf-ir-q8', encoderDirs);
  const ratedMessages = await readRatedMessages(chosen, gold, collectIndexedMessages(exported.records), messageEncoder, excludedWords);

  await messageEncoder.stop();

  const built = buildTurnReport({
    chosen,
    turns,
    hybrid,
    records: exported.records,
    gold,
    labelled: labels.length,
    runs,
    results,
    pooledByCase,
    ratedMessages,
    excludedWords,
    shortWords,
    heldOutSeed,
  });

  console.log(built.lines.join('\n'));

  if (values.out !== undefined) {
    await Bun.write(resolve(values.out), `${JSON.stringify(built.report, null, 2)}\n`);
  }
}

// The hub settings score an item against these messages, so the sample and the score pass the same.
function collectBackgroundMessages(hybrid: TurnCase[]): BackgroundMessage[] {
  return hybrid
    .map((turn) => ({ sequence: turn.recalledSequence, text: buildVectorQuery(turn.query, excludedWords) }))
    .filter((message) => message.text.trim() !== '');
}

// Reads the labels with the key and the sample they were made from, and drops each label whose
// rebuilt query differs from the message the labeller saw.
async function readLabels(turns: TurnCase[]): Promise<{ labels: Label[]; keys: SampleKey[] }> {
  if (values.labels === undefined || values.key === undefined || values.sample === undefined) {
    throw new Error('pass --labels <file> with --key <file> and --sample <file>, the sample the labels were made from');
  }

  const [text, keys, samples] = await Promise.all([
    readLabelText(resolve(values.labels)),
    readJSONLines(resolve(values.key), sampleKeySchema),
    readJSONLines(resolve(values.sample), sampleTurnSchema),
  ]);

  const parsed = parseLabelLines(text, new Set(samples.map((sample) => sample.caseID)));
  const current = pickCurrentLabels(turns, parsed.labels, samples);
  const raters = Map.groupBy(current.labels, (label) => label.by ?? 'unnamed');

  console.log({
    labels: parsed.labels.length,
    dropped: parsed.dropped,
    staleLabels: current.stale.length,
    byRater: Object.fromEntries([...raters].map(([rater, group]) => [rater, group.length])),
  });

  return { labels: current.labels, keys };
}

async function readLabelText(path: string): Promise<string> {
  const isFolder = (await stat(path)).isDirectory();
  const files = isFolder ? pickLabelFiles(await readdir(path)).map((name) => join(path, name)) : [path];

  return (await Promise.all(files.map((file) => Bun.file(file).text()))).join('\n');
}

function getGold(built: BuiltGold): Map<string, Gold> {
  if ('unknownRefs' in built) {
    throw new Error(
      `labels name ${built.absentCases.length} cases the export lacks (${built.absentCases.join(' ')}) and ${built.unknownRefs.length} references the key lacks (${built.unknownRefs.join(' ')})`,
    );
  }

  return built.gold;
}

// Writes the test set: each labelled turn with its message, what its retrieval logged, its ratings,
// and the items the labels name.
async function writeTestSet(turns: TurnCase[]): Promise<void> {
  if (values.out === undefined) {
    throw new Error('pass --out <file> for the test set');
  }

  const { labels, keys } = await readLabels(turns);
  const gold = getGold(buildGold(turns, labels, keys));

  const lines = turns.flatMap((turn) => {
    const expected = gold.get(turn.caseID);

    if (expected?.isLabelled !== true) {
      return [];
    }

    return [
      JSON.stringify({
        caseID: turn.caseID,
        message: turn.query,
        retrieved: turn.logged,
        searchMode: turn.searchMode,
        delivered: turn.delivered,
        ratings: turn.ratings,
        needed: [...expected.relevant],
        best: expected.best,
      }),
    ];
  });

  await Bun.write(resolve(values.out), `${lines.join('\n')}\n`);

  console.log({ cases: lines.length });
}

// Writes the pooled sample a rater marks, its key, and the same turns as parts to read one at a
// time.
async function writeRatingSample(turns: TurnCase[]): Promise<void> {
  if (values.out === undefined) {
    throw new Error('pass --out <dir> for the sample, its key and its parts');
  }

  // A smaller sample writes fewer parts, so a part left from an earlier sample would pass as current.
  const existing = await readdir(resolve(values.out)).catch(() => []);

  if (existing.length > 0) {
    throw new Error(`pass an empty or new --out folder: ${values.out} already holds ${existing.length} files`);
  }

  const size = Number(values.size ?? '240');
  const chosen = pickRatingTurns(turns, size, shortWords);
  const runs = pickPooledRuns(buildRuns(['leaf-ir-q8']));
  const results = await runRankings(
    chosen.chosen,
    runs,
    { loadEncoder: (name) => loadTurnEncoder(name, encoderDirs), startIndex: startMemoryIndex },
    excludedWords,
    collectBackgroundMessages(turns.filter((turn) => turn.searchMode === 'hybrid')),
  );

  const sample = buildRatingSample(chosen, collectRatingPools(runs, results, chosen.chosen, poolTopPlaces));
  const out = resolve(values.out);
  const parts = renderRatingParts(sample.turns, turnsPerPart);

  await Bun.write(join(out, 'sample.jsonl'), `${sample.turns.map((turn) => JSON.stringify(turn)).join('\n')}\n`);
  await Bun.write(join(out, 'sample-key.jsonl'), `${sample.keys.map((key) => JSON.stringify(key)).join('\n')}\n`);

  for (const [position, part] of parts.entries()) {
    await Bun.write(join(out, `part-${String(position + 1).padStart(2, '0')}.md`), part);
  }

  console.log({
    turns: sample.turns.length,
    ...sample.strata,
    parts: parts.length,
    refs: sample.turns.reduce((sum, turn) => sum + turn.items.length, 0),
    characters: parts.reduce((sum, part) => sum + part.length, 0),
  });
}

async function writeSample(turns: TurnCase[]): Promise<void> {
  if (values.out === undefined) {
    throw new Error('pass --out <file> for the sample');
  }

  const size = values.size === undefined ? null : Number(values.size);

  if (size !== null && (!Number.isInteger(size) || size < 1)) {
    throw new Error('pass --size <n>, a whole number of turns of at least 1');
  }

  const sample = buildSample(turns, size);
  const out = resolve(values.out);

  await Bun.write(out, `${sample.turns.map((turn) => JSON.stringify(turn)).join('\n')}\n`);
  await Bun.write(buildKeyPath(out), `${sample.keys.map((key) => JSON.stringify(key)).join('\n')}\n`);

  console.log({ turns: sample.turns.length, kept: sample.kept });
}

function mean(numbers: number[]): number {
  return numbers.length === 0 ? 0 : Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}
