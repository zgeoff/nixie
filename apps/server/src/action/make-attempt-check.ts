import type { AttemptCheck, AttemptCheckInput, AttemptVerdict } from '@heynixie/actions';
import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { AskCause, EffectDeclaration, PolicyDecision } from '@heynixie/policy';
import { buildActionProposalInput, makeFaultSafeDecisionPoint } from '@heynixie/policy';
import type { ToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { DecisionPointFactory } from '../utils/make-server-decisions';
import type { StoredCall } from './read-stored-call';
import { readStoredCall } from './read-stored-call';

export interface AttemptCheckOptions {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
  readonly decisions: DecisionPointFactory;
  readonly registry: ToolRegistry;
}

// Decides an action again before each attempt, from the stored call, against the rules in force now
// and at the attempt's time. A call from before the full decision point holds no inputs, so it goes
// ahead as it was decided.
export function makeAttemptCheck(options: AttemptCheckOptions): AttemptCheck {
  return async (input) => {
    const sequence = input.action.call_sequence;
    const stored = sequence === null ? null : await readStoredCall(options.log, sequence);

    if (stored === null) {
      return { kind: 'go', destinations: [] };
    }

    const declaration = options.registry.findTool(stored.tool)?.definition.declaration ?? null;

    const decide = makeFaultSafeDecisionPoint(
      options.decisions((name) => options.registry.findTool(name)?.definition.declaration ?? null, {
        readConsent: () => Promise.resolve(stored.consentCheck),
      }),
    );

    const policy = await decide({
      tool: stored.tool,
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

    return buildVerdict(options, { policy, stored, declaration, input });
  };
}

interface VerdictFacts {
  readonly policy: PolicyDecision;
  readonly stored: StoredCall;
  readonly declaration: EffectDeclaration | null;
  readonly input: AttemptCheckInput;
}

function buildVerdict(options: AttemptCheckOptions, facts: VerdictFacts): AttemptVerdict {
  const decision = facts.policy.decision;
  const destinations = facts.stored.destinations.map((destination) => destination.value);

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

  if (decision.outcome !== 'ask' || facts.declaration === null) {
    return { kind: 'go', destinations };
  }

  const cause: AskCause = decision.cause ?? 'no_rule';
  const action = facts.input.action;

  const proposal = buildActionProposalInput({
    definitions: options.definitions(),
    thread: action.task_id,
    callSequence: invariantSequence(action.call_sequence),
    tool: facts.stored.tool,
    effects: facts.declaration.effects,
    cause,
    input: facts.input.arguments,
    destinations: facts.stored.destinations,
    content: facts.declaration.content,
    frame: {
      context: facts.stored.inputs.context,
      definitionID: facts.stored.inputs.definitionID,
      sources: facts.stored.inputs.sources,
    },
    deadlineAt: action.deadline_at,
    now: options.clock.now(),
    reopen: { proposalID: facts.input.proposalID, actionID: action.action_id },
  });

  return {
    kind: 'ask',
    cause,
    destinations,
    proposalID: facts.input.proposalID,
    record: proposal.record,
  };
}

function invariantSequence(sequence: number | null): number {
  invariant(sequence !== null, 'a call that was read again has its sequence');

  return sequence;
}
