import { createShortID } from '@heynixie/db';
import type { Definitions, JSONObject, RecordInput } from '@heynixie/log';
import { buildAlwaysAllowRule } from '../rule/build-always-allow-rule';
import type { AskCause, CallDestination, Effect, PolicyCall } from '../types';
import { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import { buildGapGroupHash } from './build-gap-group-hash';

export interface ActionProposalFacts {
  readonly definitions: Definitions;
  readonly thread: string;
  readonly callSequence: number;
  readonly tool: string;

  // The hash the queue holds the call under, which covers what a prepared call expects of its page
  // or window, so an approval answers that call alone. Absent, the hash covers the tool, its input,
  // its destinations and its deadline.
  readonly actionHash?: string;

  // the URL or the window that the hash covers, which the record keeps so an approval can rebuild
  // the hash
  readonly expectURL?: string | undefined;
  readonly expectWindow?: JSONObject | undefined;
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

  // the short ID the proposal takes; drawn when absent
  readonly shortID?: string;

  // the step of the task that made the call, which an approved action queues under
  readonly stepKey?: string;

  // the sentence that says why a purchase the owner's rule would allow asks instead
  readonly budgetReached?: string;

  // For a proposal that reopens an action that already exists, such as an approved action that has
  // newly fallen in the always-ask set. The row takes the proposal ID, and the action's ID is
  // `actionID`.
  readonly reopen?: { readonly proposalID: string; readonly actionID: string };
}

export interface ActionProposalInput {
  readonly record: RecordInput;
  readonly proposalID: string;
  readonly shortID: string;
  readonly riskClass: 'routine' | 'always_ask';
  readonly actionHash: string;
  readonly ruleHash: string | null;
}

// The record of an ask. Its input and destinations are erasable, so a forget removes them.
export function buildActionProposalInput(facts: ActionProposalFacts): ActionProposalInput {
  const shortID = facts.shortID ?? createShortID();
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

  const proposalID = facts.reopen?.proposalID ?? crypto.randomUUID();
  const riskClass = facts.cause === 'always_ask' ? 'always_ask' : 'routine';

  const actionHash =
    facts.actionHash ??
    buildActionHash({
      tool: facts.tool,
      input: facts.input,
      destinations: facts.destinations.map((destination) => destination.value),
      deadlineAt: facts.deadlineAt ?? null,
    });

  const record: RecordInput = {
    kind: actionProposedCodec.kind,
    definitions: facts.definitions,
    thread: facts.thread,
    parent: facts.callSequence,
    promptCause: facts.cause,
    payload: actionProposedCodec.encode({
      proposalID,
      shortID,
      callSequence: facts.callSequence,
      tool: facts.tool,
      effects: [...facts.effects],
      actionHash,
      cause: facts.cause,
      riskClass,
      rule: alwaysAllow === null ? null : { hash: alwaysAllow.hash },
      ...gap,
      ...(facts.reopen === undefined ? {} : { actionID: facts.reopen.actionID }),
      ...(facts.expectURL === undefined ? {} : { expectURL: facts.expectURL }),
      ...(facts.expectWindow === undefined
        ? {}
        : { expectWindow: JSON.stringify(facts.expectWindow) }),
      ...(facts.stepKey === undefined ? {} : { stepKey: facts.stepKey }),
      ...(facts.budgetReached === undefined ? {} : { budgetReached: facts.budgetReached }),
      ...(facts.deadlineAt === undefined || facts.deadlineAt === null
        ? {}
        : { deadlineAt: facts.deadlineAt }),
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

  return {
    record,
    proposalID,
    shortID,
    riskClass,
    actionHash,
    ruleHash: alwaysAllow === null ? null : alwaysAllow.hash,
  };
}
