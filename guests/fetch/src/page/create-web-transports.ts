import { Agent as HTTPAgent, request as requestHTTP } from 'node:http';
import { Agent as HTTPSAgent, request as requestHTTPS } from 'node:https';

export interface WebTransports {
  readonly http: { readonly agent: HTTPAgent; readonly request: typeof requestHTTP };
  readonly https: { readonly agent: HTTPSAgent; readonly request: typeof requestHTTPS };
}

export function createWebTransports(): WebTransports {
  // A proxy would resolve the host itself, and an empty proxyEnv stops the runtime from reading
  // one from the environment.
  return {
    http: { agent: new HTTPAgent({ keepAlive: false, proxyEnv: {} }), request: requestHTTP },
    https: { agent: new HTTPSAgent({ keepAlive: false, proxyEnv: {} }), request: requestHTTPS },
  };
}
