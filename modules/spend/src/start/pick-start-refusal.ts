export interface StartFacts {
  // how many entries the secrets file holds under model_credentials
  readonly credentialCount: number;
  readonly gatewayZone: string | null;
  readonly defaultZone: string;

  // the IDs of the profiles whose base URL has a path
  readonly pathProfileIDs: readonly string[];
}

// The reasons the server refuses to start, or null when it may. A model credential on the server
// reaches the provider past the gateway, a gateway zone that differs resets periods at another
// midnight, and a base URL with a path hides the sandbox's name from the gateway.
export function pickStartRefusal(facts: StartFacts): string | null {
  if (facts.credentialCount > 0) {
    return 'the secrets file holds a model_credentials entry, and with spendStop set the deployment holds every model credential, so remove the entry';
  }

  if (facts.gatewayZone !== null && facts.gatewayZone !== facts.defaultZone) {
    return `the gateway counts its periods in ${facts.gatewayZone}, and nixie's time.default_zone is ${facts.defaultZone}; set them equal`;
  }

  if (facts.pathProfileIDs.length > 0) {
    return `with spendStop set, a profile base URL must have no path, because the gateway reads the sandbox's name from the first path segment; fix ${facts.pathProfileIDs.join(', ')}`;
  }

  return null;
}
