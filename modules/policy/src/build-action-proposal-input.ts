import { createShortID } from '@heynixie/db';
import type { Definitions, JSONObject, RecordInput } from '@heynixie/log';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import { buildAlwaysAllowRule } from './build-always-allow-rule';
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

  // the names of the tool's free-text arguments
  readonly content?: readonly string[];
}

export interface ActionProposalInput {
  readonly record: RecordInput;
  readonly shortID: string;
}

// The record of an ask. Its input and destinations are erasable, so a forget removes them.
export function buildActionProposalInput(facts: ActionProposalFacts): ActionProposalInput {
  const shortID = createShortID();
  const isRuleOffered = facts.cause === 'outside_steering' || facts.cause === 'no_rule';

  const alwaysAllow = isRuleOffered
    ? buildAlwaysAllowRule({
        shortID,
        tool: facts.tool,
        input: facts.input,
        destinations: facts.destinations.map((destination) => destination.value),
        content: facts.content ?? [],
      })
    : null;

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
      riskClass: facts.cause === 'always_ask' ? 'always_ask' : 'routine',
      rule: alwaysAllow === null ? null : { hash: alwaysAllow.hash },
    }),
    erasable: {
      ...(alwaysAllow === null
        ? {}
        : {
            rule: alwaysAllow.form,
            ruleID: alwaysAllow.ruleID,
            ruleSentence: alwaysAllow.sentence,
          }),
      input: facts.input,
      destinations: facts.destinations.map((destination) => ({
        value: destination.value,
        replyTarget: destination.replyTarget,
      })),
    },
  };

  return { record, shortID };
}
