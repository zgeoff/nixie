import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import type { TurnRetrieval } from './read-turn-retrieval';
import { renderRetrievedItems } from './render-retrieved-items';
import { renderRetrievedMessages } from './render-retrieved-messages';
import { renderRetrievedSelfNotes } from './render-retrieved-self-notes';
import type { MemoryLineOptions } from './types';

export interface TurnPreamble {
  readonly changes: string | null;
  readonly retrieval: TurnRetrieval;
  readonly thread: string;
  readonly at: string;
}

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
