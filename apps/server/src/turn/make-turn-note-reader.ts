import type { Clock } from '@heynixie/clock';
import type { CompactionSettings } from '@heynixie/compaction';
import type { Log } from '@heynixie/log';
import type { StartedMemoryStore } from '@heynixie/memory';
import {
  buildMemoryChangeKind,
  buildMomentKeptKind,
  buildProposalMergeKind,
} from '@heynixie/memory';
import { buildNoteForgottenKind } from '@heynixie/notebook';
import type { TurnNote, TurnNoteRequest } from '@heynixie/sessions';
import {
  buildCompactionHeadsUpKind,
  buildEventRegistry,
  buildProposalSettledKind,
  buildRetriedTurnKind,
} from '@heynixie/sessions';
import { buildSkillReloadKind } from '@heynixie/skills';
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
  const store = {
    recall: (request: Parameters<StartedMemoryStore['recall']>[0]) => memory().recall(request),
  };

  const kinds = buildEventRegistry([
    buildMemoryChangeKind(options.log, store),
    buildProposalMergeKind(options.log),
    buildProposalSettledKind(options.log, conversationTaskID),
    buildMomentKeptKind(options.log, options.getTaskName),
    buildOutageKind(options.log),
    buildRestartKind(options.log),
    buildRetriedTurnKind(options.log),
    buildCompactionHeadsUpKind(options.log, options.compaction),
    buildSkillReloadKind(options.log, conversationTaskID),
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
