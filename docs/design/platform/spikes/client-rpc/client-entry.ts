/* What a client bundle holds: the fetch link, the retry plugin and the contract's types. */
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ClientRetryPluginContext } from '@orpc/client/plugins';
import { ClientRetryPlugin } from '@orpc/client/plugins';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from './contract.ts';

export const client: ContractRouterClient<typeof contract, ClientRetryPluginContext> =
  createORPCClient(
    new RPCLink<ClientRetryPluginContext>({ plugins: [new ClientRetryPlugin()], url: '/rpc' }),
  );
