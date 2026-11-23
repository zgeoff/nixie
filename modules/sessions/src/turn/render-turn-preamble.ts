import type { SystemMessageType } from '@heynixie/wire';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { renderRetrievedItems } from '../retrieved/render-retrieved-items';
import { renderRetrievedSelfNotes } from '../retrieved/render-retrieved-self-notes';
import type { MemoryLineOptions } from '../types';
import type { TurnRetrieval } from './read-turn-memory';

export interface TurnPreamble {
  readonly continuation: string | null;
  readonly changes: string | null;
  readonly retrieval: TurnRetrieval;
  readonly at: string;

  // the blocks of the task run that its first step or a rebuilt session carries
  readonly runBlocks: string | null;

  // the envelope of a brief that sits in no inbox record, which comes last
  readonly brief: string | null;
}

export function renderTurnPreamble(
  preamble: TurnPreamble,
  lines: MemoryLineOptions,
  mint: () => string = mintBlockID,
): readonly string[] {
  const retrieval = preamble.retrieval;
  const at = preamble.at;

  return [
    renderPreambleMessage('task-continue', at, preamble.continuation),
    renderPreambleMessage('pinned-memory-changes', at, preamble.changes),
    renderPreambleMessage(
      'retrieved-memory',
      at,
      renderRetrievedItems(retrieval.items, lines, mint),
    ),
    renderPreambleMessage(
      'retrieved-self-notes',
      at,
      renderRetrievedSelfNotes(retrieval.selfNotes, lines, mint),
    ),
    preamble.runBlocks,
    preamble.brief,
  ].filter((block) => block !== null);
}

function renderPreambleMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}
