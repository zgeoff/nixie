import type { ContentSource } from '@heynixie/log';
import type { ChangeKind, StagedChange } from './consolidation-types';
import { findMissingToken } from './find-missing-token';
import { pickLeastTrustedSource } from './pick-least-trusted-source';
import type { MemorySubject } from './types';

interface ShownItem {
  readonly shortID: string;
  readonly version: number;
  readonly text: string;
  readonly source: ContentSource;
  readonly isPinned: boolean;
  readonly subject: MemorySubject;
}

export interface ChangeRequest {
  readonly kind: ChangeKind;
  readonly itemIDs: readonly string[];
  readonly text?: string | undefined;
  readonly reason: string;
}

type StageResult =
  | { readonly status: 'staged'; readonly changes: number }
  | { readonly status: 'refused'; readonly reason: string };

interface ConsolidationHandle {
  readonly close: () => readonly StagedChange[] | null;

  readonly readShownItemIDs: () => readonly string[];

  readonly readSummary: () => string | null;
}

export interface ConsolidationStaging {
  readonly open: (shown: ReadonlyMap<string, ShownItem>, maxChanges: number) => ConsolidationHandle;

  readonly show: (itemID: string, item: ShownItem) => void;

  readonly stage: (requests: readonly ChangeRequest[], summary?: string) => StageResult;
}

interface OpenRun {
  readonly shown: Map<string, ShownItem>;
  readonly maxChanges: number;
  diff: readonly StagedChange[] | null;
  summary: string | null;
}

const noRun: StageResult = { status: 'refused', reason: 'no consolidation run is open' };

export function createConsolidationStaging(): ConsolidationStaging {
  const state: { run: OpenRun | null } = { run: null };

  return {
    open: (shown, maxChanges) => {
      const opened: OpenRun = { shown: new Map(shown), maxChanges, diff: null, summary: null };

      state.run = opened;

      return {
        close: () => {
          if (state.run === opened) {
            state.run = null;
          }

          return opened.diff;
        },
        readShownItemIDs: () => [...opened.shown.keys()],
        readSummary: () => opened.summary,
      };
    },
    show: (itemID, item) => {
      state.run?.shown.set(itemID, item);
    },
    stage: (requests, summary) =>
      state.run === null ? noRun : updateStagedRun(state.run, { requests, summary }),
  };
}

interface StagedInput {
  readonly requests: readonly ChangeRequest[];
  readonly summary: string | undefined;
}

function updateStagedRun(run: OpenRun, staged: StagedInput): StageResult {
  if (run.diff !== null) {
    return { status: 'refused', reason: 'this run already proposed its diff' };
  }

  const planned = planDiff(run, resolveItemIDs(run.shown, staged.requests));

  if ('refusal' in planned) {
    return { status: 'refused', reason: planned.refusal };
  }

  const trimmed = staged.summary?.trim() ?? '';

  run.diff = planned.changes;
  run.summary = trimmed === '' ? null : trimmed;

  return { status: 'staged', changes: planned.changes.length };
}

interface Refusal {
  readonly refusal: string;
}

type PlannedDiff = { readonly changes: readonly StagedChange[] } | Refusal;

interface RunView {
  readonly shown: ReadonlyMap<string, ShownItem>;
  readonly maxChanges: number;
}

function planDiff(run: RunView, requests: readonly ChangeRequest[]): PlannedDiff {
  if (requests.length > run.maxChanges) {
    return {
      refusal: `a diff holds at most ${String(run.maxChanges)} changes; keep the most useful ones`,
    };
  }

  const repeated = findRepeatedItem(requests);

  if (repeated !== null) {
    const named = run.shown.get(repeated)?.shortID ?? repeated;

    return { refusal: `item ${named} is named more than once; name each item at most once` };
  }

  return planChanges(run, requests);
}

function findRepeatedItem(requests: readonly ChangeRequest[]): string | null {
  const named = requests.flatMap((request) => request.itemIDs);

  return named.find((itemID, index) => named.indexOf(itemID) !== index) ?? null;
}

function planChanges(run: RunView, requests: readonly ChangeRequest[]): PlannedDiff {
  const changes: StagedChange[] = [];

  for (const [index, request] of requests.entries()) {
    const planned = planChange(run, request);

    if ('refusal' in planned) {
      return { refusal: `change ${String(index + 1)}: ${planned.refusal}` };
    }

    changes.push(planned);
  }

  return { changes };
}

type PlannedChange = StagedChange | Refusal;

function planChange(run: RunView, request: ChangeRequest): PlannedChange {
  const shape = findShapeError(request);

  if (shape !== null) {
    return { refusal: shape };
  }

  const inputs = request.itemIDs.flatMap((itemID) => {
    const item = run.shown.get(itemID);

    return item === undefined ? [] : [{ itemID, item }];
  });

  if (inputs.length < request.itemIDs.length) {
    const missing = request.itemIDs.find((itemID) => !run.shown.has(itemID)) ?? '';

    return {
      refusal: `item ${missing} is not one you were shown; find it with memory.recall first`,
    };
  }

  const mixed = findMixedSubject(inputs);

  if (mixed !== null) {
    return { refusal: mixed };
  }

  return buildStagedChange(request, sortSurvivorFirst(inputs));
}

function findShapeError(request: ChangeRequest): string | null {
  if (request.reason.trim() === '') {
    return 'give a reason the owner can read';
  }

  if (request.text !== undefined && /\p{Cf}/u.test(request.text)) {
    return 'the text holds an invisible formatting character';
  }

  return findKindError(request, request.text !== undefined && /\S/u.test(request.text));
}

function findKindError(request: ChangeRequest, hasText: boolean): string | null {
  if (request.kind === 'merge') {
    return request.itemIDs.length >= 2 && hasText
      ? null
      : 'a merge names 2 or more items and gives the merged text';
  }

  if (request.itemIDs.length !== 1) {
    return `a ${request.kind === 'rewrite' ? 'rewrite' : 'retirement'} names exactly one item`;
  }

  if (request.kind === 'rewrite') {
    return hasText ? null : 'a rewrite gives the new text';
  }

  return request.text === undefined ? null : 'a retirement gives no text';
}

interface NamedInput {
  readonly itemID: string;
  readonly item: ShownItem;
}

function findMixedSubject(inputs: readonly NamedInput[]): string | null {
  const [first, ...rest] = inputs;
  const other = rest.find((input) => input.item.subject !== first?.item.subject);

  return first === undefined || other === undefined
    ? null
    : `items ${first.item.shortID} and ${other.item.shortID} have different subjects, ${first.item.subject} and ${other.item.subject}; merge only items of one subject`;
}

function buildStagedChange(request: ChangeRequest, inputs: readonly NamedInput[]): PlannedChange {
  const [first, ...rest] = inputs.map((input) => ({
    itemID: input.itemID,
    version: input.item.version,
  }));

  if (first === undefined) {
    return { refusal: 'it names no item' };
  }

  const reason = request.reason.trim();
  const source = pickLeastTrustedSource(inputs.map((input) => input.item.source));

  if (request.kind === 'retire') {
    return { kind: 'retire', inputs: [first], reason, source };
  }

  const text = (request.text ?? '').trim();
  const refused = findTextError(text, request.kind, inputs);

  return refused === null
    ? buildTextChange(request.kind, { inputs: [first, ...rest], text, reason, source })
    : { refusal: refused };
}

function findTextError(
  text: string,
  kind: ChangeKind,
  inputs: readonly NamedInput[],
): string | null {
  const missing = findMissingToken(text, inputs.map((input) => input.item.text).join('\n'));

  if (missing !== null) {
    return `the text holds ${missing.raw}, which none of its items holds`;
  }

  return kind === 'rewrite' && text === inputs[0]?.item.text
    ? 'the new text is the same as the current text'
    : null;
}

type TextChange = Omit<Extract<StagedChange, { readonly kind: 'merge' }>, 'kind'>;

function buildTextChange(kind: 'merge' | 'rewrite', change: TextChange): StagedChange {
  return kind === 'merge' ? { kind, ...change } : { kind, ...change, inputs: [change.inputs[0]] };
}

function sortSurvivorFirst(inputs: readonly NamedInput[]): readonly NamedInput[] {
  const pinned = inputs.findIndex((input) => input.item.isPinned);

  return pinned <= 0
    ? inputs
    : [...inputs.slice(pinned, pinned + 1), ...inputs.filter((_, index) => index !== pinned)];
}

function resolveItemIDs(
  shown: ReadonlyMap<string, ShownItem>,
  requests: readonly ChangeRequest[],
): readonly ChangeRequest[] {
  const byID = new Map(
    [...shown].flatMap(([itemID, item]) => [
      [item.shortID, itemID],
      [itemID, itemID],
    ]),
  );

  return requests.map((request) => ({
    ...request,
    itemIDs: request.itemIDs.map((id) => byID.get(id) ?? id),
  }));
}
