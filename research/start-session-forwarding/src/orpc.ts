// oxlint-disable one-var -- spike code
// The isomorphic link. Server rendering calls nixie's API over the private network and forwards
// the device session from the browser's cookie as a bearer token. The browser calls nixie's public
// URL straight, and its cookie rides along. Start holds no session of its own in either branch.
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import type { contract } from '../contract.ts';

const getLink = createIsomorphicFn()
  .server(
    () =>
      new RPCLink({
        headers: () => {
          const token = getCookie('nixie_session');
          return token
            ? { authorization: `Bearer ${token}`, 'x-nixie-client': '1' }
            : { 'x-nixie-client': '1' };
        },
        url: `${process.env.NIXIE_API_INTERNAL_URL}/rpc`,
      }),
  )
  .client(
    () =>
      new RPCLink({
        fetch: async (request, init) => await fetch(request, { ...init, credentials: 'include' }),
        headers: { 'x-nixie-client': '1' },
        url: `${import.meta.env.VITE_NIXIE_API_URL}/rpc`,
      }),
  );

export const client: ContractRouterClient<typeof contract> = createORPCClient(getLink());

export const orpc = createTanstackQueryUtils(client);
