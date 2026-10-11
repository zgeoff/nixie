import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractClient } from '../../../libs/contract/src/index';
import { clientHeaderName } from '../../../libs/contract/src/index';

// Builds a client of a deployed nixie's API, which the ingress serves under /rpc on the web
// client's host name. It sends the client header that the API asks of every call, and the device
// session as a bearer token once enrolment returns one.
export function buildLiveClient(url: string, token: string | null): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      url: new URL('/rpc', url).href,
      headers: {
        [clientHeaderName]: 'live-check',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
    }),
  );
}
