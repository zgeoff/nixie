import type { LogRecord } from '@heynixie/log';
import type { TaskBrief } from '@heynixie/tasks';
import type { HistoryTurn } from '../turn/read-recent-turns';
import type { BriefPlace } from './pick-brief-place';

export interface PinnedBriefInput {
  readonly brief: TaskBrief | null;
  readonly recent: readonly HistoryTurn[];
  readonly inbox: readonly LogRecord[];
  readonly isFirstSession: boolean;

  // where the turn puts the brief of a definition's task run, which has no record to hold it
  readonly place?: BriefPlace;
}

export interface PinnedBrief {
  // the brief the opening pins, or null when the model reads it elsewhere
  readonly pinned: TaskBrief | null;

  // the sequence of the brief the opening accounted for, or null for a task with none
  readonly briefSequence: number | null;
}

// The model reads a brief once per session: in the first turn's batch, in the preamble of a first
// turn, or in the recent turns. A rebuilt session that holds it in none of them pins it. A
// definition's brief has no record, so its place says whether the opening pins it.
export function pickPinnedBrief(input: PinnedBriefInput): PinnedBrief {
  const brief = input.brief;

  if (brief === null) {
    return { pinned: null, briefSequence: null };
  }

  const isHeld =
    input.inbox.some((record) => record.sequence === brief.sequence) ||
    input.recent.some((turn) => turn.record.sequence === brief.sequence) ||
    (brief.origin === 'created' && input.isFirstSession) ||
    (brief.origin === 'definition' && input.place !== 'pinned');

  return { pinned: isHeld ? null : brief, briefSequence: brief.sequence };
}
