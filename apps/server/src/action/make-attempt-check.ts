import type { AttemptCheck, AttemptCheckInput, AttemptVerdict } from '@heynixie/actions';
import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type {
  AskCause,
  CallDestination,
  EffectDeclaration,
  PolicyCall,
  PolicyDecision,
} from '@heynixie/policy';
import { buildActionProposalInput, makeFaultSafeDecisionPoint } from '@heynixie/policy';
import type { ToolRegistry } from '@heynixie/tools';
import { findToolDeclaration, pickPolicyToolName } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { DecisionPointFactory } from '../utils/make-server-decisions';
import { readStoredCall } from './read-stored-call';

export interface AttemptCheckOptions {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
  readonly decisions: DecisionPointFactory;
  readonly registry: ToolRegistry;

  // the declaration of an action that a runner queues, which no model's tool list holds
  readonly findRunnerDeclaration: (tool: string) => EffectDeclaration | null;
}

// Decides an action again before each attempt, from the stored call, against the rules in force now
// and at the attempt's time. A call from before the full decision point holds no inputs, so it goes
// ahead as it was decided.
export function makeAttemptCheck(options: AttemptCheckOptions): AttemptCheck {
  return async (input) => {
    if (input.action.is_runner === 1) {
      return decideRunnerAction(options, input);
    }

    const sequence = input.action.call_sequence;
    const stored = sequence === null ? null : await readStoredCall(options.log, sequence);

    if (stored === null) {
      return { kind: 'go', destinations: [] };
    }

    const policyTool = pickPolicyToolName(options.registry, stored.tool, stored.input);
    const declaration = findToolDeclaration(options.registry, policyTool);

    const decide = makeFaultSafeDecisionPoint(
      options.decisions((name) => findToolDeclaration(options.registry, name), {
        readConsent: () => Promise.resolve(stored.consentCheck),
      }),
    );

    const policy = await decide({
      tool: policyTool,
      toolList: stored.inputs.toolList,
      context: stored.inputs.context,
      definitionID: stored.inputs.definitionID,
      args: stored.input,
      destinations: stored.destinations,
      sources: stored.inputs.sources,
      at: options.clock.now(),
      turnMessageSequence: stored.inputs.turnMessageSequence,
      onBehalfOf: stored.inputs.onBehalfOf,
      snapshot: options.definitions().snapshotHash,
    });

    return buildVerdict(options, {
      policy,
      policyTool,
      declaration,
      input,
      destinations: stored.destinations,
      frame: stored.inputs,
    });
  };
}

const runnerFrame = { context: 'task', definitionID: null, sources: ['task'] } as const;

// An action that a runner queued has no call of its own, so its attempt meets the decision point
// under its own tool, with its task as the caller.
async function decideRunnerAction(
  options: AttemptCheckOptions,
  input: AttemptCheckInput,
): Promise<AttemptVerdict> {
  const tool = input.action.tool;

  const declaration =
    options.findRunnerDeclaration(tool) ?? findToolDeclaration(options.registry, tool);

  if (declaration === null) {
    return { kind: 'deny', rule: null, message: `no tool declares the effects of ${tool}` };
  }

  const destinations = collectRunnerDestinations(declaration, input);

  const decide = makeFaultSafeDecisionPoint(
    options.decisions((name) => (name === tool ? declaration : null), {
      readConsent: () => Promise.resolve(null),
    }),
  );

  // A snapshot's declaration of the same name, such as the tool that only queues this action, wins
  // in the decision point, so the call carries the action's own effects to join them.
  const policy = await decide({
    tool,
    toolList: [tool],
    effects: declaration.effects,
    ...runnerFrame,
    sources: [...runnerFrame.sources],
    args: input.arguments,
    destinations,
    at: options.clock.now(),
    turnMessageSequence: null,
    onBehalfOf: [],
    snapshot: options.definitions().snapshotHash,
  });

  return buildVerdict(options, {
    policy,
    policyTool: tool,
    declaration,
    input,
    destinations,
    frame: runnerFrame,
  });
}

// Each argument that the declaration names holds one destination, as a call's does.
function collectRunnerDestinations(
  declaration: EffectDeclaration,
  input: AttemptCheckInput,
): CallDestination[] {
  return declaration.destinations.flatMap((argument) => {
    const value = input.arguments[argument];

    return typeof value === 'string' ? [{ value: value.normalize('NFC'), replyTarget: false }] : [];
  });
}

interface VerdictFacts {
  readonly policy: PolicyDecision;
  readonly policyTool: string;
  readonly declaration: EffectDeclaration | null;
  readonly input: AttemptCheckInput;
  readonly destinations: readonly CallDestination[];
  readonly frame: Pick<PolicyCall, 'context' | 'definitionID' | 'sources'>;
}

function buildVerdict(options: AttemptCheckOptions, facts: VerdictFacts): AttemptVerdict {
  const decision = facts.policy.decision;
  const destinations = facts.destinations.map((destination) => destination.value);

  if (decision.outcome === 'deny') {
    return {
      kind: 'deny',
      rule:
        decision.rule === null ? null : { id: decision.rule.id, revision: decision.rule.revision },
      message:
        decision.rule === null
          ? (facts.policy.sentence ?? 'no rule allowed this call')
          : `rule ${decision.rule.id} (r${String(decision.rule.revision)})`,
    };
  }

  const replyTargets = facts.destinations
    .filter((destination) => destination.replyTarget)
    .map((destination) => destination.value);

  if (decision.outcome !== 'ask' || facts.declaration === null) {
    return { kind: 'go', destinations, replyTargets };
  }

  const cause: AskCause = decision.cause ?? 'no_rule';
  const action = facts.input.action;

  const proposal = buildActionProposalInput({
    definitions: options.definitions(),
    thread: action.task_id,
    callSequence: invariantSequence(action.call_sequence),
    tool: facts.policyTool,
    actionHash: action.action_hash,
    effects: facts.declaration.effects,
    cause,
    input: facts.input.arguments,
    destinations: facts.destinations,
    content: facts.declaration.content,
    frame: {
      context: facts.frame.context,
      definitionID: facts.frame.definitionID,
      sources: facts.frame.sources,
    },
    deadlineAt: action.deadline_at,
    now: options.clock.now(),
    reopen: { proposalID: facts.input.proposalID, actionID: action.action_id },
  });

  return {
    kind: 'ask',
    cause,
    destinations,
    replyTargets,
    proposalID: facts.input.proposalID,
    record: proposal.record,
  };
}

function invariantSequence(sequence: number | null): number {
  invariant(
    sequence !== null,
    'a call that was read again, or a runner action, has the sequence of its cause',
  );

  return sequence;
}
