import { checkConsent } from '../consent/check-consent';
import type { PlaceKey, Trust } from '../place/types';
import type { DecisionPointOptions } from '../rule/make-decision-point';
import { makeDecisionPoint } from '../rule/make-decision-point';
import type { ReplayOptions } from '../rule/replay-decision';
import type {
  ConsentAnswer,
  ConsentMessage,
  DecisionPoint,
  EffectDeclaration,
  PolicyInputs,
  RuleEntry,
} from '../types';

// An entry of the directory, with a short ID derived from its ID.
interface TestPlace {
  readonly id: string;
  readonly key: PlaceKey;
  readonly trust: Trust;
  readonly name?: string;
}

export interface TestDecisionPointOptions {
  readonly places?: readonly TestPlace[];
  readonly declaration?: EffectDeclaration | null;
  readonly rules?: readonly RuleEntry[];
  readonly inputs?: Partial<PolicyInputs>;
  readonly messages?: readonly ConsentMessage[];
  readonly answer?: ConsentAnswer;
  readonly taskDestinations?: readonly string[];
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
        places: (options.places ?? []).map((place) => ({
          placeID: place.id,
          shortID: `short-${place.id}`,
          key: place.key,
          trust: place.trust,
          name: place.name ?? null,
        })),
        tools: new Map(),
        ...options.inputs,
      }),
    findTaskDestinations: () => options.taskDestinations ?? [],
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
