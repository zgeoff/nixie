import type { FetchBackoff, FetchSandbox } from '@heynixie/connectors';
import type { DeviceFetching } from '@heynixie/devices';
import type { AddressCheck } from '@heynixie/egress';
import type { Definitions, Log } from '@heynixie/log';
import type { EffectDeclaration } from '@heynixie/policy';
import { makeFaultSafeDecisionPoint } from '@heynixie/policy';
import { readStoredCall } from '../action/read-stored-call';
import type { DecisionPointFactory } from '../utils/make-server-decisions';

export interface DeviceFetchingOptions {
  readonly fetch: Pick<FetchSandbox, 'readBody' | 'readPackage'>;
  readonly registry: string;
  readonly backoff: FetchBackoff;
  readonly checkAddress: AddressCheck;
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: { readonly now: () => number };
  readonly makeDecide: DecisionPointFactory;

  // the declaration of a tool by its name, which the registry answers once the tools are built
  readonly findDeclaration: (tool: string) => EffectDeclaration | null;
}

const regionToolName = 'device.region';

// What the device tools need to reach the web: the fetch sandbox, and a check that asks the decision
// point again, with no card, whether the rules in force now allow the hosts of a page that an
// earlier call decided. An ask answers no, because a refresh has no owner to ask.
export function makeDeviceFetching(options: DeviceFetchingOptions): DeviceFetching {
  return {
    readBody: options.fetch.readBody,
    readPackage: options.fetch.readPackage,
    registry: options.registry,
    backoff: options.backoff,
    checkAddress: options.checkAddress,
    checkHosts: async (callSequence, hosts) => {
      const stored = await readStoredCall(options.log, callSequence);

      if (stored?.tool !== regionToolName) {
        return false;
      }

      const decide = makeFaultSafeDecisionPoint(
        options.makeDecide(options.findDeclaration, {
          readConsent: () => Promise.resolve(stored.consentCheck),
        }),
      );

      const policy = await decide({
        tool: stored.tool,
        toolList: stored.inputs.toolList,
        context: stored.inputs.context,
        definitionID: stored.inputs.definitionID,
        args: stored.input,
        destinations: hosts.map((host) => ({ value: host, replyTarget: false })),
        effects: ['read'],
        sources: stored.inputs.sources,
        at: options.clock.now(),
        turnMessageSequence: stored.inputs.turnMessageSequence,
        onBehalfOf: stored.inputs.onBehalfOf,
        snapshot: options.definitions().snapshotHash,
      });

      return policy.decision.outcome === 'allow';
    },
  };
}
