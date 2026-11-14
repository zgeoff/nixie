import { readSnapshotPolicy } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { getTypedQuote, readOwnerMessagesBySequence } from '@heynixie/memory';
import type {
  ConsentAnswer,
  DecisionPoint,
  EffectDeclaration,
  RunConsentCheck,
} from '@heynixie/policy';
import { checkConsent, makeDecisionPoint, readKnownContacts } from '@heynixie/policy';

export type DecisionPointFactory = (
  findDeclaration: (tool: string) => EffectDeclaration | null,
) => DecisionPoint;

export interface ServerDecisionsOptions {
  readonly log: Log;
  readonly linkMaxAgeMs: number;

  // the consent checker, which starts after the decision points do
  readonly readCheck: () => RunConsentCheck | null;
}

const unavailable: ConsentAnswer = { verdict: 'unsure', failure: 'error' };

export function makeServerDecisions(options: ServerDecisionsOptions): DecisionPointFactory {
  return (findDeclaration) =>
    makeDecisionPoint({
      findDeclaration,
      readInputs: async (snapshot) => {
        const read = await readSnapshotPolicy(options.log.writer.db, snapshot);
        const contacts = await readKnownContacts(options.log, read.contactIDs);

        return {
          rules: read.rules,
          contacts,
          tools: read.tools,
          ownerDestinations: [],
        };
      },
      findJobDestinations: () => [],
      readConsent: (call, facts) =>
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
        ),
    });
}
