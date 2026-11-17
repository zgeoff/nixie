export interface GatewayRoute {
  readonly sandboxName: string;
  readonly profileID: string;
}

// The base URL of a model request that counts by sandbox: the profile's base URL, then the
// sandbox's name, then the profile's ID, which is the gateway's route ID.
export function buildGatewayBaseURL(baseURL: string, route: GatewayRoute): string {
  return `${baseURL.replace(/\/+$/u, '')}/${route.sandboxName}/${route.profileID}`;
}
