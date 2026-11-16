import { createShortID } from '@heynixie/db';
import type { Definitions, JSONObject, RecordInput } from '@heynixie/log';
import { buildAlwaysAllowRule } from '../rule/build-always-allow-rule';
import type { AskCause, CallDestination, Effect, PolicyCall } from '../types';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import { buildGapGroupHash } from './build-gap-group-hash';
import { pickActionLapse } from './pick-action-lapse';

export interface ActionProposalFacts {
  readonly definitions: Definitions;
  readonly thread: string;
  readonly callSequence: number;
  readonly tool: string;

  // the name the action hash knows the tool by, when it differs from `tool`: a tool with variants
  // hashes under its registry name, so a repeat of the call finds the same action
  readonly actionTool?: string;
  readonly effects: readonly Effect[];
  readonly cause: AskCause;
  readonly input: JSONObject;
  readonly destinations: readonly CallDestination[];

  // the names of the tool's free-text arguments
  readonly content?: readonly string[];

  // the call's frame, which a no_rule ask records so its answer can join a gap group
  readonly frame?: Pick<PolicyCall, 'context' | 'definitionID' | 'sources'>;

  // the time after which the action must not start; the proposal lapses no later than it
  readonly deadlineAt?: number | null;
  readonly now?: number;

  // the step of the task that made the call, which an approved action queues under
  readonly stepKey?: string;

  // For a proposal that reopens an action that already exists, such as an approved action that has
  // newly fallen in the always-ask set. The row takes the proposal ID, and the action's ID is
  // `actionID`.
  readonly reopen?: { readonly proposalID: string; readonly actionID: string };
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

  const gap =
    facts.cause === 'no_rule' && facts.frame !== undefined
      ? {
          groupHash: buildGapGroupHash({
            tool: facts.tool,
            context: facts.frame.context,
            destinations: facts.destinations.map((destination) => destination.value),
          }),
          context: facts.frame.context,
          definitionID: facts.frame.definitionID,
          sources: [...facts.frame.sources],
          content: [...(facts.content ?? [])],
        }
      : {};

  const record: RecordInput = {
    kind: actionProposedCodec.kind,
    definitions: facts.definitions,
    thread: facts.thread,
    parent: facts.callSequence,
    promptCause: facts.cause,
    payload: actionProposedCodec.encode({
      proposalID: facts.reopen?.proposalID ?? crypto.randomUUID(),
      shortID,
      callSequence: facts.callSequence,
      tool: facts.tool,
      effects: [...facts.effects],
      actionHash: buildActionHash({
        tool: facts.actionTool ?? facts.tool,
        input: facts.input,
        destinations: facts.destinations.map((destination) => destination.value),
        deadlineAt: facts.deadlineAt ?? null,
      }),
      cause: facts.cause,
      riskClass: facts.cause === 'always_ask' ? 'always_ask' : 'routine',
      rule: alwaysAllow === null ? null : { hash: alwaysAllow.hash },
      ...gap,
      ...(facts.reopen === undefined ? {} : { actionID: facts.reopen.actionID }),
      ...(facts.stepKey === undefined ? {} : { stepKey: facts.stepKey }),
      ...(facts.deadlineAt === undefined || facts.deadlineAt === null || facts.now === undefined
        ? {}
        : { deadlineAt: facts.deadlineAt, lapsesAt: pickActionLapse(facts.now, facts.deadlineAt) }),
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
