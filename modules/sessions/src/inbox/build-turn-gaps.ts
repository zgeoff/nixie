import { formatGap } from '../message/format-gap';
import type { TurnGaps } from '../types';

export interface TurnSuggestedRuleFacts {
  // when the turn starts
  readonly startedAtMs: number;

  // when the model's previous conversation turn ended, or null before the first
  readonly lastTurnEndedAtMs: number | null;

  // the moment the owner-message gap runs to: the arrival of an owner message that starts the turn,
  // and otherwise the turn's start
  readonly ownerGapEndsAtMs: number;

  // when the owner's previous message arrived, or null when the owner never wrote
  readonly ownerLastWroteAtMs: number | null;
}

export function buildTurnGaps(facts: TurnSuggestedRuleFacts): TurnGaps {
  return {
    sinceYourLastTurn:
      facts.lastTurnEndedAtMs === null
        ? null
        : formatGap(facts.startedAtMs - facts.lastTurnEndedAtMs),
    sinceOwnerLastWrote:
      facts.ownerLastWroteAtMs === null
        ? null
        : formatGap(facts.ownerGapEndsAtMs - facts.ownerLastWroteAtMs),
  };
}
