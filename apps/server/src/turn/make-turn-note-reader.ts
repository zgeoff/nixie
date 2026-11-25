import type { Clock } from '@heynixie/clock';
import type { CompactionSettings } from '@heynixie/compaction';
import type { Log } from '@heynixie/log';
import type { AnswerQuoteSource, StartedMemoryStore } from '@heynixie/memory';
import {
  buildMemoryChangeKind,
  buildMomentKeptKind,
  buildProposalAnswerKind,
  buildProposalMergeKind,
} from '@heynixie/memory';
import { buildNoteForgottenKind } from '@heynixie/notebook';
import type { TurnNote, TurnNoteRequest } from '@heynixie/sessions';
import {
  buildCompactionHeadsUpKind,
  buildEventRegistry,
  buildRetriedTurnKind,
} from '@heynixie/sessions';
import { buildSkillProposalAnswerKind, buildSkillReloadKind } from '@heynixie/skills';
import { conversationTaskID } from '@heynixie/tasks';
import { buildPromptProposalAnswerKind } from '../prompt/build-prompt-proposal-answer-kind';
import { buildMandateEndedKind } from './build-mandate-ended-kind';
import { buildMandateStartedKind } from './build-mandate-started-kind';
import { buildOutageKind } from './build-outage-kind';
import { buildPageEventKind } from './build-page-event-kind';
import { buildRestartKind } from './build-restart-kind';
import { readTurnNotes } from './read-turn-notes';

export interface TurnNoteReaderOptions {
  readonly log: Pick<Log, 'writer' | 'deploymentKey'>;
  readonly clock: Pick<Clock, 'now'>;

  readonly ownerName: string | null;

  readonly defaultZone: string;

  readonly compaction: Pick<CompactionSettings, 'threshold' | 'headsUp'>;

  readonly getTaskName: (taskID: string) => string;

  // which kinds of forget the events block lists
  readonly forgetNotices: { readonly note: boolean };
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

  const kinds = buildEventRegistry([
    buildMemoryChangeKind(options.log, store),
    buildProposalMergeKind(options.log),
    buildProposalAnswerKind(options.log, store),
    buildMomentKeptKind(options.log, options.getTaskName),
    buildOutageKind(options.log),
    buildRestartKind(options.log),
    buildRetriedTurnKind(options.log),
    buildCompactionHeadsUpKind(options.log, options.compaction),
    buildSkillReloadKind(options.log, conversationTaskID),
    buildSkillProposalAnswerKind(options.log, conversationTaskID),
    buildPromptProposalAnswerKind(options.log, conversationTaskID),
    buildMandateStartedKind(options.log),
    buildMandateEndedKind(options.log),
    buildPageEventKind(options.log),
  ]);

  const events = options.forgetNotices.note
    ? [...kinds, ...buildEventRegistry([buildNoteForgottenKind(options.log)])]
    : kinds;

  return (request) => readTurnNotes({ ...options, events }, request);
}
