import { createShortID } from '@heynixie/db';
import type { Definitions, JSONObject, RecordInput } from '@heynixie/log';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import type { AskCause, CallDestination, Effect } from './types';

export interface ActionProposalFacts {
  readonly definitions: Definitions;
  readonly thread: string;
  readonly callSequence: number;
  readonly tool: string;
  readonly effects: readonly Effect[];
  readonly cause: AskCause;
  readonly input: JSONObject;
  readonly destinations: readonly CallDestination[];
}

export interface ActionProposalInput {
  readonly record: RecordInput;
  readonly shortID: string;
}

// The record of an ask. Its input and destinations are erasable, so a forget removes them.
export function buildActionProposalInput(facts: ActionProposalFacts): ActionProposalInput {
  const shortID = createShortID();

  const record: RecordInput = {
    kind: actionProposedCodec.kind,
    definitions: facts.definitions,
    thread: facts.thread,
    parent: facts.callSequence,
    promptCause: facts.cause,
    payload: actionProposedCodec.encode({
      proposalID: crypto.randomUUID(),
      shortID,
      callSequence: facts.callSequence,
      tool: facts.tool,
      effects: [...facts.effects],
      actionHash: buildActionHash({
        tool: facts.tool,
        input: facts.input,
        destinations: facts.destinations.map((destination) => destination.value),
      }),
      cause: facts.cause,
    }),
    erasable: {
      input: facts.input,
      destinations: facts.destinations.map((destination) => ({
        value: destination.value,
        replyTarget: destination.replyTarget,
      })),
    },
  };

  return { record, shortID };
}
