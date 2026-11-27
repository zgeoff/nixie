import type { Definitions } from '@heynixie/log';
import type { Effect, PolicyDecision } from '@heynixie/policy';
import { collectActedPlaces, writePlaceActed } from '@heynixie/policy';
import type { ToolCall } from '../types';
import type { ToolCallOptions } from './tool-call-options';

export interface DirectActs {
  readonly options: ToolCallOptions;
  readonly definitions: Definitions;
  readonly policy: PolicyDecision;
  readonly effects: readonly Effect[];
  readonly call: ToolCall;
  readonly thread: string;
}

// A direct call that an act place allowed owes the place one record; a queued call writes its own
// when its attempt runs.
export async function writeDirectActs(acts: DirectActs): Promise<void> {
  const decision = acts.policy.decision;

  const owed = collectActedPlaces(
    {
      outcome: decision.outcome,
      permissions: decision.destinations.map((destination) => destination.permission),
      places: decision.places,
    },
    acts.effects,
  );

  for (const place of owed) {
    await writePlaceActed(
      { log: acts.options.log, definitions: () => acts.definitions },
      {
        placeID: place.placeID,
        shortID: place.shortID,
        callID: acts.call.callID,
        tool: acts.call.tool,
        thread: acts.thread,
      },
    );
  }
}
