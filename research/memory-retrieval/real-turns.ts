/* oxlint-disable max-statements, no-await-in-loop -- a spike that runs each turn and setting in turn */
// Measures per-turn retrieval on a deployment's own conversations. It reads the plain export of a data
// directory, rebuilds each turn, and prints counts and scores only, never a message or an item.
//
//   bun real-turns.ts stats  --plain <dir>
//   bun real-turns.ts replay --plain <dir> [--names <file>]
//   bun real-turns.ts sample --plain <dir> --out <file> [--size <n>]
//   bun real-turns.ts cases  --plain <dir> --labels <file> --key <file> --sample <file> --out <file>
//   bun real-turns.ts score  --plain <dir> [--labels <file> --key <file> --sample <file>] [--names <file>] [--encoders <a,b>] [--out <file>]
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { TurnCase } from './real-turns/build-turn-cases.ts';
import type { BuiltGold, SampleKey } from './real-turns/build-gold.ts';
import { buildGold } from './real-turns/build-gold.ts';
import { buildKeyPath } from './real-turns/build-key-path.ts';
import { buildTurnCases } from './real-turns/build-turn-cases.ts';
import type { EncoderName } from './real-turns/load-turn-encoder.ts';
import { ENCODERS, loadTurnEncoder } from './real-turns/load-turn-encoder.ts';
import { buildSample, sampleTurnSchema } from './real-turns/build-sample.ts';
import { pickCurrentLabels } from './real-turns/pick-current-labels.ts';
import { parseEncoderNames } from './real-turns/parse-encoder-names.ts';
import { readPlainExport } from './real-turns/read-plain-export.ts';
// @boundaries-ignore a spike imports the code it measures
import { startMemoryIndex } from '../../modules/memory/src/start-memory-index.ts';
import { buildRanker, SHIPPED } from './real-turns/rank-turn.ts';
import { readJSONLines } from './real-turns/read-json-lines.ts';
import { buildScoreReport } from './real-turns/build-score-report.ts';
import { pickScoredTurns } from './real-turns/pick-scored-turns.ts';
import type { Gold, Label } from './real-turns/score-turns.ts';
import { buildRuns, labelSchema, runRankings, sampleKeySchema } from './real-turns/score-turns.ts';

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
  },
});

const repoRoot = resolve(import.meta.dir, '../..');

const encoderDirs = {
  shipped: join(repoRoot, 'node_modules/.cache/nixie-encoder'),
  models: resolve(process.env['MODELS_DIR'] ?? join(repoRoot, '.scratch/models')),
};

if (values.plain === undefined) {
  throw new Error('pass --plain <dir>, the folder an export of the data directory wrote');
}

const cases = buildTurnCases(await readPlainExport(resolve(values.plain)));
const excludedWords = values.names === undefined ? [] : await readNames(values.names);
const command = positionals[0];

if (command === 'stats') {
  printStats(cases);
} else if (command === 'replay') {
  await runReplay(cases.filter((turn) => turn.searchMode === 'hybrid'));
} else if (command === 'sample') {
  await writeSample(cases);
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
  const { labels, keys } = values.labels === undefined ? { labels: [], keys: [] } : await readLabels(turns);
  const gold = getGold(buildGold(turns, labels, keys));
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
  );
  const scored = buildScoreReport(runs, results, gold);

  console.log(`turns ${chosen.length}, labelled ${labels.length}\n`);
  console.log(scored.lines.join('\n'));

  if (values.out !== undefined) {
    const report = { turns: chosen.length, labelled: labels.length, ...scored.report };

    await Bun.write(resolve(values.out), `${JSON.stringify(report, null, 2)}\n`);
  }
}

// Reads the labels with the key and the sample they were made from, and drops each label whose
// rebuilt query differs from the message the labeller saw.
async function readLabels(turns: TurnCase[]): Promise<{ labels: Label[]; keys: SampleKey[] }> {
  if (values.labels === undefined || values.key === undefined || values.sample === undefined) {
    throw new Error('pass --labels <file> with --key <file> and --sample <file>, the sample the labels were made from');
  }

  const [labels, keys, samples] = await Promise.all([
    readJSONLines(resolve(values.labels), labelSchema),
    readJSONLines(resolve(values.key), sampleKeySchema),
    readJSONLines(resolve(values.sample), sampleTurnSchema),
  ]);

  const current = pickCurrentLabels(turns, labels, samples);

  console.log({ labels: labels.length, staleLabels: current.stale.length });

  return { labels: current.labels, keys };
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
