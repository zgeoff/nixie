// Counts the tokens each memory block adds to one turn's input, by rendering the block through the
// product's own renderers and counting it the way the product budgets text: about 4 characters a
// token.
// @boundaries-ignore a spike imports the code it measures
import { countTextTokens } from '../../../modules/compaction/src/count-text-tokens.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderPinnedMemory } from '../../../modules/sessions/src/render-pinned-memory.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedItems } from '../../../modules/sessions/src/render-retrieved-items.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedMessages } from '../../../modules/sessions/src/render-retrieved-messages.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedSelfNotes } from '../../../modules/sessions/src/render-retrieved-self-notes.ts';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryItem } from '../../../modules/sessions/src/types.ts';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemMessage } from '../../../libs/wire/src/render-system-message.ts';
import type { TurnCase } from './build-turn-cases.ts';

export interface BlockTokens {
  pinned: number;
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

// Pinned memory goes in a session's opening only, so it counts on the turn that opens a session.
// The other blocks repeat on every turn that has something for them.
export function buildBlockTokens(turn: TurnCase, sources: BlockSources, options: BlockOptions): BlockTokens {
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
    .filter((candidate) => candidate.isPinned)
    .map((candidate) => buildItem(candidate.itemID, candidate.version, candidate.text));

  return {
    pinned: turn.isSessionStart ? wrap('pinned-memory', renderPinnedMemory(pinned, lines)) : 0,
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
