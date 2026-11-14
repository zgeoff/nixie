import { checkConsent } from '../check-consent';
import { makeDecisionPoint } from '../make-decision-point';
import type { Effect, EffectDeclaration, RuleEntry, RuleSource } from '../types';
import { buildTypedMessage } from './build-test-decision-point';
import { readStarterRules } from './read-starter-rules';

export interface ScenarioStep {
  readonly tool: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly context: 'conversation' | 'task' | 'job';
  readonly job?: string;

  // the text the owner typed in the message that started the turn
  readonly typed?: string;

  // the reply target of the call, which a job's reply may use
  readonly replyTarget?: string;
  readonly toolList?: readonly string[];
  readonly sources?: readonly RuleSource[];
}

interface ScenarioOptions {
  readonly extraRules?: readonly RuleEntry[];
}

// Runs scripted calls through the real decision point, and reports each as one line, with the starter rules in force, the owner
// known by the destination `owner`, a partner as a known contact and a checker that agrees.
export function readScenarioRunner(options: ScenarioOptions = {}) {
  const rules = [...readStarterRules(), ...(options.extraRules ?? [])];

  const decide = makeDecisionPoint({
    findDeclaration: (tool) => findScenarioDeclaration(tool),
    readInputs: () =>
      Promise.resolve({
        rules,
        contacts: [
          { contactID: 'contact-1', name: null, destination: 'partner@example.com' },
          { contactID: 'contact-2', name: 'Sam', destination: 'sam@example.com' },
        ],
        tools: new Map(),
        ownerDestinations: ['owner'],
      }),
    findJobDestinations: () => [],
    readConsent: (call, facts) =>
      checkConsent(
        {
          readOwnerMessages: (sequences) =>
            Promise.resolve(
              sequences.map((sequence) =>
                buildTypedMessage(sequence, String(call.args['typed']), call.at),
              ),
            ),
          isTypedText: (message, text) => message.text.includes(text),
          runCheck: () => Promise.resolve({ verdict: 'asserted', failure: null }),
          getLinkMaxAgeMs: () => 24 * 3_600_000,
        },
        call,
        facts,
      ),
  });

  const run = async (step: ScenarioStep): Promise<string> => {
    const declaration = findScenarioDeclaration(step.tool);
    const args = step.args ?? {};

    const destinations = (declaration?.destinations ?? []).flatMap((name) =>
      collectDestinationValues(args[name]).map((value) => ({
        value,
        replyTarget: value === step.replyTarget,
      })),
    );

    const result = await decide({
      tool: step.tool,
      toolList: step.toolList ?? [step.tool],
      context: step.context === 'job' ? 'job' : step.context,
      definitionID: step.job ?? null,
      args: step.typed === undefined ? args : { ...args, typed: step.typed },
      destinations,
      sources: step.sources ?? (step.typed === undefined ? ['own_data'] : ['owner']),
      at: 1_794_550_000_000,
      turnMessageSequence: step.typed === undefined ? null : 1,
      onBehalfOf: [],
      snapshot: 'snapshot-1',
    });

    const cause = 'cause' in result.decision ? ` (${result.decision.cause})` : '';

    return `${step.tool}: ${result.decision.outcome} at stage ${result.decision.stage}${cause}`;
  };

  return {
    run,
    runAll: (steps: readonly ScenarioStep[]) => Promise.all(steps.map((step) => run(step))),
  };
}

// The tools of the scripted scenarios, each with the effects its declaration holds.
const scenarioTools: ReadonlyMap<string, readonly [readonly Effect[], readonly string[]]> = new Map(
  [
    ['search.web', [['fetch'], []]],
    ['web.fetch', [['fetch'], []]],
    ['mail.search', [['read'], []]],
    ['mail.read', [['read'], []]],
    ['mail.label', [['write'], []]],
    ['mail.archive', [['write'], []]],
    ['mail.trash', [['write'], []]],
    ['mail.purge', [['delete'], []]],
    ['mail.draft', [['write'], []]],
    ['mail.send', [['send'], ['to', 'cc']]],
    ['mail.reply', [['send'], ['to']]],
    ['calendar.list', [['read'], []]],
    ['calendar.invite', [['send'], ['attendees']]],
    ['booking.reserve', [['send'], ['venue']]],
    ['shop.buy', [['spend'], ['merchant']]],
    ['notes.write', [['note'], []]],
    ['notify.owner', [['note'], ['to']]],
    ['job.create', [['schedule'], []]],
    ['home.lights', [['device'], []]],
    ['rules.add', [['policy_widen'], []]],
  ],
);

function findScenarioDeclaration(tool: string): EffectDeclaration | null {
  const entry = scenarioTools.get(tool);

  if (entry === undefined) {
    return null;
  }

  return {
    effects: entry[0],
    destinations: entry[1],
    amount: tool === 'shop.buy' ? 'amount' : null,
    content: [],
    results: {},
  };
}

function collectDestinationValues(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return [value];
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
