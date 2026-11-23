import type { Labels, MemorySubject } from '../types';

export interface RetopicTarget {
  readonly topic: string;
  readonly subject: MemorySubject;
}

export interface RetopicItemRef {
  readonly itemID: string;
  readonly shortID: string;
}

// A move names a whole topic with the sub-topics under it, or items one by one.
export type RetopicSource =
  | { readonly kind: 'topic'; readonly topic: string; readonly subject: MemorySubject }
  | { readonly kind: 'items'; readonly items: readonly RetopicItemRef[] };

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

  // the move in words, such as `self/lines → self/diary, 20 items`
  readonly sentence: string;
}
