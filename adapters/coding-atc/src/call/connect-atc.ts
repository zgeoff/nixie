import { connectGateway } from '@atcx/client/gateway';
import type { FleetProcedures } from '@atcx/contract';

// atc-gateway's typed fleet API.
export type ATCFleet = FleetProcedures;

export interface ATCConnection {
  // the gateway's https URL; a trailing `/mcp` is dropped, because the client calls `/rpc` under it
  readonly url: string;

  // the bearer of each request
  readonly token: string;
}

export function connectATC(connection: ATCConnection): ATCFleet {
  return connectGateway({ url: toGatewayURL(connection.url), token: connection.token });
}

export function toGatewayURL(url: string): string {
  return url.replace(/\/+$/u, '').replace(/\/mcp$/u, '');
}
