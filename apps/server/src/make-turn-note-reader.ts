import type { Clock } from '@heynixie/clock';
import type { CompactionSettings } from '@heynixie/compaction';
import type { Log } from '@heynixie/log';
import type { AnswerQuoteSource, StartedMemoryStore } from '@heynixie/memory';
import {
  buildCatchUpKind,
  buildMemoryChangeKind,
  buildProposalAnswerKind,
  buildProposalMergeKind,
} from '@heynixie/memory';
import type { TurnNote, TurnNoteRange } from '@heynixie/sessions';
import {
  buildCompactionHeadsUpKind,
  buildEventRegistry,
  buildRetriedTurnKind,
} from '@heynixie/sessions';
import { buildRestartKind } from './build-restart-kind';
import { readTurnNotes } from './read-turn-notes';

export interface TurnNoteReaderOptions {
  readonly log: Pick<Log, 'writer' | 'deploymentKey'>;
  readonly clock: Pick<Clock, 'now'>;

  // the owner's name, or null for "the owner"
  readonly ownerName: string | null;

  // the zone events show in until one of the owner's messages carries a zone
  readonly defaultZone: string;

  // the shares of the window at which the conversation's session compacts and hears it is near
  readonly compaction: Pick<CompactionSettings, 'threshold' | 'headsUp'>;
}

// Makes the reader of the note before each turn: the events, memory changes included, whose kinds
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
    buildMemoryChangeKind(options.log, store),
    buildCatchUpKind(options.log),
    buildProposalMergeKind(options.log),
    buildProposalAnswerKind(options.log, store),
    buildRestartKind(options.log),
    buildRetriedTurnKind(options.log),
    buildCompactionHeadsUpKind(options.log, options.compaction),
  ]);

  return (span) => readTurnNotes({ ...options, events }, span);
}
