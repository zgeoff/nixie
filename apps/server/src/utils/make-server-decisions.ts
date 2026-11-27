import { readSnapshotPolicy } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { getTypedQuote, readOwnerMessagesBySequence } from '@heynixie/memory';
import type {
  ConsentAnswer,
  DecisionPoint,
  DecisionPointOptions,
  EffectDeclaration,
  PolicyPlace,
  RunConsentCheck,
} from '@heynixie/policy';
import { checkConsent, makeDecisionPoint, parsePlace, readPlaces } from '@heynixie/policy';

// A decision point that rereads a stored call passes the consent answer the call recorded, because
// the consent checker is a model.
interface DecisionOverrides {
  readonly readConsent: DecisionPointOptions['readConsent'];
}

export type DecisionPointFactory = (
  findDeclaration: (tool: string) => EffectDeclaration | null,
  overrides?: DecisionOverrides,
) => DecisionPoint;

export interface ServerDecisionsOptions {
  readonly log: Log;
  readonly linkMaxAgeMs: number;

  // the consent checker, which starts after the decision points do
  readonly readCheck: () => RunConsentCheck | null;

  // the addresses that are you, such as each connected Google account's own: a mail to one needs no
  // card, and forgetting the connection takes the address away
  readonly readOwnerDestinations: () => Promise<readonly string[]>;
}

const unavailable: ConsentAnswer = { verdict: 'unsure', failure: 'error' };

export function makeServerDecisions(options: ServerDecisionsOptions): DecisionPointFactory {
  return (findDeclaration, overrides) =>
    makeDecisionPoint({
      findDeclaration,
      readInputs: async (snapshot) => {
        const read = await readSnapshotPolicy(options.log.writer.db, snapshot);

        const stored = await readPlaces(options.log, {
          placeIDs: read.places.map((place) => place.placeID),
        });

        // a call decides under the level its snapshot holds
        const levels = new Map(read.places.map((place) => [place.placeID, place.trust]));

        const owners = await options.readOwnerDestinations();

        const places: readonly PolicyPlace[] = [
          ...stored.map((place) => ({
            placeID: place.placeID,
            shortID: place.shortID,
            key: place.key,
            trust: levels.get(place.placeID) ?? place.trust,
            name: place.name,
          })),
          ...buildOwnPlaces(owners),
        ];

        return { rules: read.rules, places, tools: read.tools };
      },
      findTaskDestinations: () => [],
      readConsent:
        overrides?.readConsent ??
        ((call, facts) =>
          checkConsent(
            {
              readOwnerMessages: (sequences) => readOwnerMessagesBySequence(options.log, sequences),
              isTypedText: (message, text) =>
                getTypedQuote({ ...message, timeZone: null }, text).status === 'typed',
              runCheck: (request) => options.readCheck()?.(request) ?? Promise.resolve(unavailable),
              getLinkMaxAgeMs: () => options.linkMaxAgeMs,
            },
            call,
            facts,
          )),
    });
}

// The addresses that are you come from the connected accounts, so forgetting a connection takes its
// address away. Each is a place at self that holds no record.
function buildOwnPlaces(addresses: readonly string[]): readonly PolicyPlace[] {
  return addresses.map((address) => {
    const parsed = parsePlace(address);

    return {
      placeID: `self:${address}`,
      shortID: 'self',
      key: parsed?.kind === 'address' ? parsed : ({ kind: 'raw', value: address } as const),
      trust: 'self',
      name: null,
    };
  });
}
