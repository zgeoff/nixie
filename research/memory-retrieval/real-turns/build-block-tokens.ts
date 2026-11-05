// Counts the tokens each memory block adds to one turn's input, by rendering the block through the
// product's own renderers and counting it the way the product budgets text: about 4 characters a
// token.
// @boundaries-ignore a spike imports the code it measures
import { countTextTokens } from '../../../modules/compaction/src/count-text-tokens.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderPinnedMemory } from '../../../modules/sessions/src/render-pinned-memory.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderCoreChanges } from '../../../modules/sessions/src/render-core-changes.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedItems } from '../../../modules/sessions/src/render-retrieved-items.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedMessages } from '../../../modules/sessions/src/render-retrieved-messages.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedSelfNotes } from '../../../modules/sessions/src/render-retrieved-self-notes.ts';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryItem, MemoryRef } from '../../../modules/sessions/src/types.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemMessage } from '../../../libs/wire/src/render-system-message.ts';
import type { TurnCase } from './build-turn-cases.ts';

export interface BlockTokens {
  pinned: number;
  pinnedChanges: number;
  items: number;
  selfNotes: number;
  messages: number;
}

export interface VersionMeta {
  shortID: string;
  subject: MemoryItem['subject'];
  origin: MemoryItem['origin'];
  source: MemoryItem['source'];
  recordedAt: number;
  quote: string | null;
}

export interface BlockSources {
  versions: Map<string, VersionMeta>;
}

export interface BlockOptions {
  ownerName: string | null;
  defaultZone: string;
}

// The product's default pinned core budget, which the change note's last line states.
const pinnedCoreBudget = 2000;

// The product shows pinned memory in a session's opening only, and on a later turn writes a change
// note when the core differs from the previous turn's.
export function buildBlockTokens(
  turn: TurnCase,
  sources: BlockSources,
  options: BlockOptions,
  previousPinned: readonly MemoryRef[] | null = null,
): BlockTokens {
  const at = new Date(turn.recordedAt);
  const lines = { ownerName: options.ownerName, defaultZone: options.defaultZone, now: at };
  const wrap = (type: Parameters<typeof renderSystemMessage>[0]['type'], body: string | null): number =>
    body === null ? 0 : countTextTokens(renderSystemMessage({ type, at: at.toISOString(), body }));

  const buildItem = (itemID: string, version: number, text: string): MemoryItem => {
    const meta = sources.versions.get(`${itemID}@${version}`);

    return {
      itemID,
      version,
      shortID: meta?.shortID ?? 'm0000000000',
      subject: meta?.subject ?? 'owner',
      text,
      origin: meta?.origin ?? 'owner',
      source: meta?.source ?? 'owner',
      model: null,
      recordedAt: meta?.recordedAt ?? 0,
      evidenceQuote: meta?.quote ?? null,
      approval: null,
    };
  };

  const byID = new Map(turn.candidates.map((candidate) => [candidate.itemID, candidate]));
  const shown = turn.logged.flatMap((logged) => {
    const candidate = byID.get(logged.itemID);

    return candidate === undefined ? [] : [{ candidate, item: buildItem(logged.itemID, logged.version, candidate.text) }];
  });

  const pinned = turn.candidates
    .filter((candidate) => candidate.isPinned && !candidate.isLapsed)
    .map((candidate) => buildItem(candidate.itemID, candidate.version, candidate.text));

  const pinnedBody = renderPinnedMemory(pinned, lines);
  const unpinnedShortIDs = new Map(
    (previousPinned ?? []).map((ref) => [ref.itemID, sources.versions.get(`${ref.itemID}@${ref.version}`)?.shortID ?? ref.itemID]),
  );
  const use = { items: pinned.length, tokens: pinnedBody === null ? 0 : countTextTokens(pinnedBody), budget: pinnedCoreBudget };

  return {
    pinned: turn.isSessionStart ? wrap('pinned-memory', pinnedBody) : 0,
    pinnedChanges: turn.isSessionStart
      ? 0
      : wrap('pinned-memory-changes', renderCoreChanges(previousPinned, pinned, { ...lines, unpinnedShortIDs, use })),
    items: wrap(
      'retrieved-memory',
      renderRetrievedItems(
        shown.filter((entry) => !entry.candidate.isSelf).map((entry) => entry.item),
        lines,
      ),
    ),
    selfNotes: wrap(
      'retrieved-self-notes',
      renderRetrievedSelfNotes(
        shown.filter((entry) => entry.candidate.isSelf).map((entry) => entry.item),
        lines,
      ),
    ),
    messages: wrap(
      'retrieved-messages',
      renderRetrievedMessages(
        turn.shownMessages,
        { ...lines, thread: 'conversation' },
      ),
    ),
  };
}
