// Runs the full-core trials and writes runs/full-core.json. Each trial opens a new session with the
// core filled to its budget, edits one item in the middle of it, unpins one and pins a new one, and
// asks about them on the turn with the change note and on 2 turns after it.
//
//   bun full-core.ts <trials> <max dollars>
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { SessionPoint } from '../../libs/wire/src/index';
import type { Grade, Probe } from './build-grade';
import { buildGrade, formatGrade } from './build-grade';
import type { SpikeTurn } from './run-spike-turn';
import { profile, runSpikeTurnWithRetry } from './run-spike-turn';
import {
  buildChangedCore,
  buildCoreUse,
  buildFullCore,
  buildLines,
  buildOwnerInput,
  renderChangeNote,
  renderOpening,
  renderSpikeSystemPrompt,
} from './spike-core';
import { edits } from './spike-fixtures';

interface TrialTurn {
  readonly label: string;
  readonly message: string;
  readonly probe: Probe;

  // whether the turn opens the session, carries the change note, or neither
  readonly blocks: 'opening' | 'note' | 'none';
}

interface TurnRecord {
  readonly label: string;
  readonly sentAt: string;
  readonly blocks: TrialTurn['blocks'];
  readonly message: string;
  readonly reply: string;
  readonly grade: Grade;
  readonly attempts: number;
  readonly usage: SpikeTurn['usage'];
  readonly costUSD: number;
  readonly error: string | null;
}

const turns: readonly TrialTurn[] = [
  {
    label: 'opening, old core',
    blocks: 'opening',
    message: "Two quick things before I post Edda's birthday card: which city does she live in, and what's Biscuit's vet called?",
    probe: { expect: ['Ghent', 'Osei'], stale: [] },
  },
  {
    label: 'change note',
    blocks: 'note',
    message: "I'm sending Edda a parcel with a courier. Which city do I put on the label?",
    probe: { expect: ['Rotterdam'], stale: ['Ghent'] },
  },
  {
    label: 'next turn, no note',
    blocks: 'none',
    message:
      "A pharmacy form asks for any medicine allergies, and for my sister's city for the emergency contact. What do I write for each?",
    probe: { expect: ['penicillin', 'Rotterdam'], stale: ['Ghent', 'no known'] },
  },
  {
    label: 'unchanged items',
    blocks: 'none',
    message: "And what's the guest wifi password, and which dentist practice do I go to?",
    probe: { expect: ['heron-42', 'Oudegracht'], stale: [] },
  },
];

const trialCount = Number(process.argv[2] ?? 5);
const maxUSD = Number(process.argv[3] ?? 2);
const runFile = join(import.meta.dir, 'runs', 'full-core.json');
const core = buildFullCore();
const train = core.find((item) => item.text.includes('07:40'));

if (train === undefined) {
  throw new Error('the full core lost the item the trials unpin');
}

const changed = buildChangedCore(core, {
  edits: [edits.sister, edits.allergy],
  unpinIDs: [train.itemID],
  savedAt: new Date(),
});
const trials: (readonly TurnRecord[])[] = [];
let spentUSD = 0;

await mkdir(join(import.meta.dir, 'runs'), { recursive: true });

for (let trial = 0; trial < trialCount && spentUSD < maxUSD; trial += 1) {
  // oxlint-disable-next-line no-await-in-loop -- one trial at a time keeps one CLI in memory
  const records = await runTrial();

  trials.push(records);
  spentUSD += records.reduce((total, record) => total + record.costUSD, 0);

  // oxlint-disable-next-line no-await-in-loop -- the file holds every trial that has finished
  await Bun.write(
    runFile,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        profile: { model: profile.model, effort: profile.effort, cacheTTL: profile.cacheTTL },
        core: buildCoreUse(core),
        changedCore: buildCoreUse(changed),
        spentUSD,
        trials,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`trial ${trial + 1}: ${records.map((record) => formatGrade(record.grade)).join(' ')}, $${spentUSD.toFixed(4)}`);
}

async function runTrial(): Promise<readonly TurnRecord[]> {
  const home = await mkdtemp(join(tmpdir(), 'pinned-core-scale-'));
  const systemPrompt = renderSpikeSystemPrompt();
  const records: TurnRecord[] = [];
  let resume: SessionPoint | null = null;

  try {
    for (const [index, turn] of turns.entries()) {
      const sentAt = new Date();
      // oxlint-disable-next-line no-await-in-loop -- each turn resumes where the one before ended
      const blocks = await renderBlocks(turn.blocks, sentAt);
      // oxlint-disable-next-line no-await-in-loop -- each turn resumes where the one before ended
      const result = await runSpikeTurnWithRetry({
        home,
        systemPrompt,
        input: buildOwnerInput(100 + index * 2, sentAt, turn.message, blocks),
        resume,
      });

      records.push({
        label: turn.label,
        sentAt: sentAt.toISOString(),
        blocks: turn.blocks,
        message: turn.message,
        reply: result.reply,
        grade: buildGrade(result.reply, turn.probe),
        attempts: result.attempts,
        usage: result.usage,
        costUSD: result.costUSD,
        error: result.error,
      });

      if (result.boundary === null) {
        return records;
      }

      resume = result.boundary;
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }

  return records;
}

function renderBlocks(blocks: TrialTurn['blocks'], sentAt: Date): Promise<readonly string[]> {
  const lines = buildLines(sentAt);

  if (blocks === 'opening') {
    return renderOpening(core, lines, profile.model);
  }

  const note = blocks === 'note' ? renderChangeNote(core, changed, lines) : null;

  return Promise.resolve(note === null ? [] : [note]);
}
