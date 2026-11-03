// Keeps one conversation session open for days and writes runs/long-session.json after every turn.
// A turn runs every <hours> hours on the same session, each resuming at the last turn's boundary.
// The core changes 4 times, each change note rides only the turn after its change, and later turns
// ask about the changed items with no note. A second start with the same run file continues the
// session where it stopped.
//
//   bun long-session.ts <home> <hours between turns> <max dollars>
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { SessionPoint } from '../../libs/wire/src/index';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryItem } from '../../modules/sessions/src/types';
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

type ChangeName = 'sister' | 'wifi' | 'allergy' | 'vet';

interface SessionStep {
  readonly message: string;
  readonly probe: Probe | null;
  readonly change: ChangeName | null;
}

interface TurnRecord {
  readonly step: number;
  readonly sentAt: string;
  readonly change: ChangeName | null;
  readonly message: string;
  readonly reply: string;
  readonly grade: Grade | null;
  readonly attempts: number;
  readonly boundary: SessionPoint | null;
  readonly usage: SpikeTurn['usage'];
  readonly costUSD: number;
  readonly error: string | null;
}

interface SleepGap {
  readonly from: string;
  readonly seconds: number;
}

interface RunState {
  readonly profile: { readonly model: string; readonly effort: string; readonly cacheTTL: string };
  readonly startedAt: string;
  readonly hoursBetweenTurns: number;
  readonly core: ReturnType<typeof buildCoreUse>;
  readonly turns: readonly TurnRecord[];
  readonly failures: readonly TurnRecord[];
  readonly gaps: readonly SleepGap[];
  readonly spentUSD: number;
  readonly finishedAt: string | null;
}

const steps: readonly SessionStep[] = [
  {
    message: "Morning! Bram's popping round later. What's the guest wifi password, and who's Biscuit's vet again?",
    probe: { expect: ['heron-42', 'Osei'], stale: [] },
    change: null,
  },
  {
    message: 'Writing Edda a postcard tonight. Which city do I address it to?',
    probe: { expect: ['Ghent'], stale: [] },
    change: null,
  },
  {
    message: "I'm ordering Edda a plant from a florist. Which city should they deliver to?",
    probe: { expect: ['Rotterdam'], stale: ['Ghent'] },
    change: 'sister',
  },
  { message: "What could I cook tonight? Keep what I eat in mind.", probe: null, change: null },
  { message: 'When do the bins go out this week?', probe: null, change: null },
  { message: 'Remind me which evening choir is.', probe: null, change: null },
  {
    message: "Biscuit's sneezing a bit. Who should I ring?",
    probe: { expect: ['Osei'], stale: [] },
    change: null,
  },
  { message: 'Plan me a Saturday with my run and some time at the allotment.', probe: null, change: null },
  {
    message: "Edda's birthday parcel is wrapped. Which city does it go to again?",
    probe: { expect: ['Rotterdam'], stale: ['Ghent'] },
    change: null,
  },
  { message: "Any ideas for Juniper's birthday present?", probe: null, change: null },
  {
    message: "The pet insurance form wants the vet's name. What do I write?",
    probe: { expect: ['Osei'], stale: [] },
    change: null,
  },
  { message: "It's drizzling. Worth taking the train home today?", probe: null, change: null },
  {
    message: "Bram's coming over to look at the router. Which guest wifi password should he use?",
    probe: { expect: ['kestrel-17'], stale: ['heron-42'] },
    change: 'wifi',
  },
  { message: 'Any thoughts on a game for board game night?', probe: null, change: null },
  {
    message: "Biscuit's check-up form asks for the vet. Whose name goes on it?",
    probe: { expect: ['Osei'], stale: [] },
    change: null,
  },
  { message: 'Should I call Mum today or tomorrow?', probe: null, change: null },
  {
    message: "Updating my contacts: what's Edda's city, and what's the guest wifi password?",
    probe: { expect: ['Rotterdam', 'kestrel-17'], stale: ['Ghent', 'heron-42'] },
    change: null,
  },
  { message: 'What should I read once I finish the Earthsea books?', probe: null, change: null },
  {
    message: "The dentist's new-patient form asks about medicine allergies. What do I put?",
    probe: { expect: ['penicillin'], stale: ['no known'] },
    change: 'allergy',
  },
  { message: 'Plan a dinner for Juniper and me tonight.', probe: null, change: null },
  {
    message: 'My GP wants a list of my medicine allergies. What do I tell them?',
    probe: { expect: ['penicillin'], stale: ['no known'] },
    change: null,
  },
  {
    message: "A friend's visiting tonight. What's the guest wifi password?",
    probe: { expect: ['kestrel-17'], stale: ['heron-42'] },
    change: null,
  },
  { message: 'What should we do this weekend if it stays dry?', probe: null, change: null },
  {
    message: 'Edda asked if I will visit soon. Roughly how long is the train from Utrecht to where she lives?',
    probe: { expect: ['Rotterdam'], stale: ['Ghent'] },
    change: null,
  },
  {
    message: 'Biscuit needs her booster jab. Who do I book it with?',
    probe: { expect: ['Hale'], stale: ['Osei'] },
    change: 'vet',
  },
  {
    message:
      "Last check before I fill in the cat-sitter's sheet: Biscuit's vet, the guest wifi password, my medicine allergies, and Edda's city?",
    probe: { expect: ['Hale', 'kestrel-17', 'penicillin', 'Rotterdam'], stale: ['Osei', 'heron-42', 'Ghent'] },
    change: null,
  },
];

const sleepChunkMs = 60_000;

// a chunk that takes this much longer than asked means the host slept
const gapSlackMs = 60_000;

const [home = '', hoursArgument = '3', maxArgument = '3'] = process.argv.slice(2);
const hoursBetweenTurns = Number(hoursArgument);
const maxUSD = Number(maxArgument);

if (home === '') {
  console.error('usage: bun long-session.ts <home> <hours between turns> <max dollars>');
  process.exit(1);
}

const runFile = join(import.meta.dir, 'runs', 'long-session.json');
const firstCore = buildFullCore();
const train = firstCore.find((item) => item.text.includes('07:40'));

if (train === undefined) {
  throw new Error('the full core lost the item the session unpins');
}

const changes: Readonly<Record<ChangeName, { readonly edits: readonly MemoryItem[]; readonly unpinIDs: readonly string[] }>> = {
  sister: { edits: [edits.sister], unpinIDs: [] },
  wifi: { edits: [edits.wifi], unpinIDs: [] },
  allergy: { edits: [edits.allergy], unpinIDs: [train.itemID] },
  vet: { edits: [edits.vet], unpinIDs: [] },
};

await mkdir(join(import.meta.dir, 'runs'), { recursive: true });

let state = await readState();
const systemPrompt = renderSpikeSystemPrompt();

for (let step = state.turns.length; step < steps.length && state.spentUSD < maxUSD; step += 1) {
  const due = Date.parse(state.startedAt) + step * hoursBetweenTurns * 60 * 60 * 1000;
  // oxlint-disable-next-line no-await-in-loop -- each turn waits for its time
  const gaps = await waitUntil(due);

  // oxlint-disable-next-line no-await-in-loop -- each turn resumes where the one before ended
  const record = await runStep(step, state);
  const isTurnEnded = record.boundary !== null;

  // a turn with no boundary stays out of the turns, so a second start runs its step again on the
  // session the last ended turn left
  state = {
    ...state,
    turns: isTurnEnded ? [...state.turns, record] : state.turns,
    failures: isTurnEnded ? state.failures : [...state.failures, record],
    gaps: [...state.gaps, ...gaps],
    spentUSD: state.spentUSD + record.costUSD,
    finishedAt: isTurnEnded && step === steps.length - 1 ? new Date().toISOString() : null,
  };

  // oxlint-disable-next-line no-await-in-loop -- the file holds every turn that has finished
  await writeState(state);
  console.log(
    `${record.sentAt} step ${step}${record.change === null ? '' : ` note:${record.change}`}: ${record.grade === null ? '-' : formatGrade(record.grade)}, $${state.spentUSD.toFixed(4)}${record.error === null ? '' : `, error ${record.error}`}`,
  );

  if (!isTurnEnded) {
    break;
  }
}

async function readState(): Promise<RunState> {
  const file = Bun.file(runFile);

  if (await file.exists()) {
    const saved: RunState = await file.json();

    return saved;
  }

  return {
    profile: { model: profile.model, effort: profile.effort, cacheTTL: profile.cacheTTL },
    startedAt: new Date().toISOString(),
    hoursBetweenTurns,
    core: buildCoreUse(firstCore),
    turns: [],
    failures: [],
    gaps: [],
    spentUSD: 0,
    finishedAt: null,
  };
}

async function writeState(next: RunState): Promise<void> {
  await Bun.write(runFile, `${JSON.stringify(next, null, 2)}\n`);
}

// sleeps in short chunks and records each chunk that ran long, which only a host sleep explains
async function waitUntil(due: number): Promise<readonly SleepGap[]> {
  const gaps: SleepGap[] = [];

  for (let remaining = due - Date.now(); remaining > 0; remaining = due - Date.now()) {
    const asked = Math.min(sleepChunkMs, remaining);
    const before = Date.now();

    // oxlint-disable-next-line no-await-in-loop -- the wait is the point
    await Bun.sleep(asked);

    const took = Date.now() - before;

    if (took > asked + gapSlackMs) {
      gaps.push({ from: new Date(before).toISOString(), seconds: Math.round((took - asked) / 1000) });
    }
  }

  return gaps;
}

async function runStep(step: number, saved: RunState): Promise<TurnRecord> {
  const sessionStep = steps[step];

  if (sessionStep === undefined) {
    throw new Error(`the session has no step ${String(step)}`);
  }

  const sentAt = new Date();
  const lines = buildLines(sentAt);
  const before = buildCoreAt(saved.turns);
  const blocks =
    step === 0 ? await renderOpening(before, lines, profile.model) : renderNote(before, sessionStep.change, sentAt);
  const result = await runSpikeTurnWithRetry({
    home,
    systemPrompt,
    input: buildOwnerInput(100 + step * 2, sentAt, sessionStep.message, blocks),
    resume: saved.turns.at(-1)?.boundary ?? null,
  });

  return {
    step,
    sentAt: sentAt.toISOString(),
    change: sessionStep.change,
    message: sessionStep.message,
    reply: result.reply,
    grade: sessionStep.probe === null ? null : buildGrade(result.reply, sessionStep.probe),
    attempts: result.attempts,
    boundary: result.boundary,
    usage: result.usage,
    costUSD: result.costUSD,
    error: result.error,
  };
}

// the core as the earlier turns left it, each change saved at the time of the turn that carried it
function buildCoreAt(turns: readonly TurnRecord[]): readonly MemoryItem[] {
  return turns.reduce<readonly MemoryItem[]>(
    (core, turn) =>
      turn.change === null
        ? core
        : buildChangedCore(core, { ...changes[turn.change], savedAt: new Date(turn.sentAt) }),
    firstCore,
  );
}

function renderNote(before: readonly MemoryItem[], change: ChangeName | null, sentAt: Date): readonly string[] {
  if (change === null) {
    return [];
  }

  const after = buildChangedCore(before, { ...changes[change], savedAt: sentAt });
  const note = renderChangeNote(before, after, buildLines(sentAt));

  return note === null ? [] : [note];
}
