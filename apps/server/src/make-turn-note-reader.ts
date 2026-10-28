import type { Clock } from '@heynixie/clock';
import type { CompactionSettings } from '@heynixie/compaction';
import type { Log } from '@heynixie/log';
import type { AnswerQuoteSource, StartedMemoryStore } from '@heynixie/memory';
import {
  buildCatchUpKind,
  buildMemoryChangeKind,
  buildMomentKeptKind,
  buildProposalAnswerKind,
  buildProposalMergeKind,
  buildSelfNoteFlagKind,
} from '@heynixie/memory';
import type { TurnNote, TurnNoteRequest } from '@heynixie/sessions';
import {
  buildCompactionHeadsUpKind,
  buildEventRegistry,
  buildRetriedTurnKind,
} from '@heynixie/sessions';
import { buildSkillProposalAnswerKind, buildSkillReloadKind } from '@heynixie/skills';
import { conversationTaskID } from '@heynixie/tasks';
import { buildPromptProposalAnswerKind } from './build-prompt-proposal-answer-kind';
import { buildRestartKind } from './build-restart-kind';
import { readTurnNotes } from './read-turn-notes';

export interface TurnNoteReaderOptions {
  readonly log: Pick<Log, 'writer' | 'deploymentKey'>;
  readonly clock: Pick<Clock, 'now'>;

  readonly ownerName: string | null;

  readonly defaultZone: string;

  readonly compaction: Pick<CompactionSettings, 'threshold' | 'headsUp'>;

  readonly getTaskName: (taskID: string) => string;
}

export function makeTurnNoteReader(
  options: TurnNoteReaderOptions,
  memory: () => StartedMemoryStore,
): (request?: TurnNoteRequest) => Promise<TurnNote> {
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
    buildSelfNoteFlagKind(options.log),
    buildMomentKeptKind(options.log, options.getTaskName),
    buildRestartKind(options.log),
    buildRetriedTurnKind(options.log),
    buildCompactionHeadsUpKind(options.log, options.compaction),
    buildSkillReloadKind(options.log, conversationTaskID),
    buildSkillProposalAnswerKind(options.log, conversationTaskID),
    buildPromptProposalAnswerKind(options.log, conversationTaskID),
  ]);

  return (request) => readTurnNotes({ ...options, events }, request);
}
