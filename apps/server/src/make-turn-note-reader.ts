import type { Log } from '@heynixie/log';
import type { AnswerQuoteSource, StartedMemoryStore } from '@heynixie/memory';
import { buildProposalAnswerKind } from '@heynixie/memory';
import type { TurnNote, TurnNoteRange } from '@heynixie/models';
import { buildEventRegistry, buildRetriedTurnKind } from '@heynixie/models';
import type { Clock } from '@heynixie/tasks';
import { buildRestartKind } from './build-restart-kind';
import { readTurnNotes } from './read-turn-notes';

export interface TurnNoteReaderOptions {
  readonly log: Pick<Log, 'writer' | 'deploymentKey'>;
  readonly clock: Pick<Clock, 'now'>;

  // the owner's name, or null for "the owner"
  readonly ownerName: string | null;

  // the zone events show in until one of the owner's messages carries a zone
  readonly defaultZone: string;
}

// Makes the reader of the note before each turn: the memory changes and the events, whose kinds
// read memory through the getter, because the store starts after the conversation. Given a span,
// it reads the note a new session's recent turns carry again over that span.
export function makeTurnNoteReader(
  options: TurnNoteReaderOptions,
  memory: () => StartedMemoryStore,
): (span?: TurnNoteRange) => Promise<TurnNote> {
  const store: AnswerQuoteSource = {
    recall: (request) => memory().recall(request),
    proposals: {
      readRejectedEdits: (proposalIDs) => memory().proposals.readRejectedEdits(proposalIDs),
    },
  };

  const events = buildEventRegistry([
    buildProposalAnswerKind(options.log, store),
    buildRestartKind(options.log),
    buildRetriedTurnKind(options.log),
  ]);

  return (span) => readTurnNotes({ ...options, store, events }, span);
}
