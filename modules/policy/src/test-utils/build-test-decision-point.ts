import { checkConsent } from '../check-consent';
import type { DecisionPointOptions } from '../make-decision-point';
import { makeDecisionPoint } from '../make-decision-point';
import type { ReplayOptions } from '../replay-decision';
import type {
  ConsentAnswer,
  ConsentMessage,
  DecisionPoint,
  EffectDeclaration,
  PolicyInputs,
  RuleEntry,
} from '../types';

export interface TestDecisionPointOptions {
  readonly declaration?: EffectDeclaration | null;
  readonly rules?: readonly RuleEntry[];
  readonly inputs?: Partial<PolicyInputs>;
  readonly messages?: readonly ConsentMessage[];
  readonly answer?: ConsentAnswer;
  readonly jobDestinations?: readonly string[];
  readonly linkMaxAgeMs?: number;
}

export interface TestDecisionPoint {
  readonly decide: DecisionPoint;
  readonly replay: ReplayOptions;
  readonly asked: string[];
}

export function buildTestDeclaration(
  overrides: Partial<EffectDeclaration> = {},
): EffectDeclaration {
  return {
    effects: ['send'],
    destinations: ['to'],
    amount: null,
    content: ['body'],
    results: {},
    ...overrides,
  };
}

// A text is typed when a message contains it inside a typed span.
export function buildTestDecisionPoint(options: TestDecisionPointOptions = {}): TestDecisionPoint {
  const asked: string[] = [];

  const declaration =
    options.declaration === undefined ? buildTestDeclaration() : options.declaration;

  const decisionOptions: DecisionPointOptions = {
    findDeclaration: () => declaration,
    readInputs: () =>
      Promise.resolve({
        rules: options.rules ?? [],
        contacts: [],
        tools: new Map(),
        ownerDestinations: [],
        ...options.inputs,
      }),
    findJobDestinations: () => options.jobDestinations ?? [],
    readConsent: (call, facts) =>
      checkConsent(
        {
          readOwnerMessages: (sequences) =>
            Promise.resolve(
              (options.messages ?? []).filter((message) => sequences.includes(message.sequence)),
            ),
          isTypedText: (message, text) => {
            const start = message.text.indexOf(text);

            return (
              start !== -1 &&
              message.spans.some(
                (span) =>
                  span.source === 'typed' && span.start <= start && start + text.length <= span.end,
              )
            );
          },
          runCheck: (request) => {
            asked.push(request.input);

            return Promise.resolve(options.answer ?? { verdict: 'asserted', failure: null });
          },
          getLinkMaxAgeMs: () => options.linkMaxAgeMs ?? 24 * 3_600_000,
        },
        call,
        facts,
      ),
  };

  return { decide: makeDecisionPoint(decisionOptions), replay: decisionOptions, asked };
}

export function buildTypedMessage(sequence: number, text: string, sentAt: number): ConsentMessage {
  return { sequence, text, spans: [{ start: 0, end: text.length, source: 'typed' }], sentAt };
}
