import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import type { TurnRetrieval } from './read-turn-retrieval';
import { renderRetrievedItems } from './render-retrieved-items';
import { renderRetrievedMessages } from './render-retrieved-messages';
import { renderRetrievedSelfNotes } from './render-retrieved-self-notes';
import type { MemoryLineOptions } from './types';

// What goes before a turn's first message: the pinned core's change note, what retrieval placed,
// the turn's thread, and the time each block carries.
export interface TurnPreamble {
  readonly changes: string | null;
  readonly retrieval: TurnRetrieval;
  readonly thread: string;
  readonly at: string;
}

// Renders the blocks that go before a turn's first message, each a system message, in this order:
// the change note, the retrieved facts, the retrieved self-notes, then the past messages. A block
// with nothing in it is left out.
export function renderTurnPreamble(
  preamble: TurnPreamble,
  lines: MemoryLineOptions,
): readonly string[] {
  const retrieval = preamble.retrieval;
  const at = preamble.at;

  return [
    renderPreambleMessage('pinned-memory-changes', at, preamble.changes),
    renderPreambleMessage('retrieved-memory', at, renderRetrievedItems(retrieval.items, lines)),
    renderPreambleMessage(
      'retrieved-self-notes',
      at,
      renderRetrievedSelfNotes(retrieval.selfNotes, lines),
    ),
    renderPreambleMessage(
      'retrieved-messages',
      at,
      renderRetrievedMessages(retrieval.messages, { ...lines, thread: preamble.thread }),
    ),
  ].filter((block) => block !== null);
}

function renderPreambleMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}
