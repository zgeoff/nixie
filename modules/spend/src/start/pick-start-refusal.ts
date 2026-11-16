import type { AboveCap } from '../types';

export interface StartFacts {
  // how many entries the secrets file holds under model_credentials
  readonly credentialCount: number;
  readonly gatewayZone: string | null;
  readonly defaultZone: string;
}

// The reasons the server refuses to start, or null when it may. A server that holds a model
// credential could reach the provider past the gateway, and a gateway in another zone resets its
// periods at another midnight than nixie's.
export function pickStartRefusal(facts: StartFacts): string | null {
  if (facts.credentialCount > 0) {
    return 'the secrets file holds a model_credentials entry, and with spendStop set the deployment holds every model credential, so remove the entry';
  }

  if (facts.gatewayZone !== null && facts.gatewayZone !== facts.defaultZone) {
    return `the gateway counts its periods in ${facts.gatewayZone}, and nixie's time.default_zone is ${facts.defaultZone}; set them equal`;
  }

  return null;
}

export function formatAboveCap(refused: AboveCap): string {
  const period = refused.period === null ? 'a period' : `the ${refused.period}`;

  return `the gateway refuses the configured limit of ${period}, which is above its cap of ${String(refused.cap.dollars)} dollars and ${String(refused.cap.tokens)} tokens`;
}
