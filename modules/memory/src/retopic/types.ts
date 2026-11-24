import type { Labels, MemorySubject } from '../types';
import type { TopicMoveCode } from '../utils/error/topic-move-error';

export interface RetopicTarget {
  readonly topic: string;
  readonly subject: MemorySubject;
}

interface RetopicItemRef {
  readonly itemID: string;
  readonly shortID: string;
  readonly state: RetopicItemState;
}

type RetopicItemState = 'active' | 'retired';

// A move names a whole topic with the sub-topics under it, or items one by one.
export type RetopicSource =
  | { readonly kind: 'topic'; readonly topic: string; readonly subject: MemorySubject }
  | { readonly kind: 'items'; readonly shortIDs: readonly string[] };

// An active or retired item, as the move reads it.
export interface RetopicItem extends RetopicItemRef {
  readonly subject: MemorySubject;
  readonly isPinned: boolean;
  readonly labels: Labels;
}

export interface RetopicMove extends RetopicItemRef {
  readonly gist: string;
  readonly fromSubject: MemorySubject;
  readonly fromTopic: string;
  readonly toTopic: string;
}

export interface RetopicPlan {
  readonly to: RetopicTarget;
  readonly moves: readonly RetopicMove[];

  // the move in words, such as `self/lines → self/diary, 18 active, 2 retired`
  readonly sentence: string;
}

export type RetopicPlanResult =
  | { readonly status: 'planned'; readonly plan: RetopicPlan }
  | { readonly status: 'refused'; readonly code: TopicMoveCode; readonly message: string };

export interface MovedCounts {
  readonly active: number;
  readonly retired: number;
}
