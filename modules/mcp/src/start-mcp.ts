import type { CredentialStore, HeldBackend } from '@heynixie/credentials';
import type { Definitions, Log } from '@heynixie/log';
import { subscribeToChanged } from '@heynixie/log';
import type { ProposalKindHandler } from '@heynixie/proposals';
import { applyListing } from './listing/apply-listing';
import { listServerTools } from './listing/list-server-tools';
import { allowTool } from './proposal/allow-tool';
import type { AllowResult } from './proposal/allow-tool';
import { makeMcpProposalHandler } from './proposal/make-mcp-proposal-handler';
import { createToolCatalog } from './registry/create-tool-catalog';
import type { ToolCatalog } from './registry/create-tool-catalog';
import type { McpServerRow, McpToolRow } from './rows/mcp-tables';
import { readServerRows } from './rows/read-server-rows';
import { readToolRows } from './rows/read-tool-rows';
import { createSignIn } from './signin/create-sign-in';
import type { ConnectResult, FinishInput, FinishResult } from './signin/create-sign-in';
import { forgetGrants } from './signin/forget-grants';
import { buildFetchOptions, readBindings } from './signin/read-bindings';
import type { BindingsRuntime } from './signin/read-bindings';
import type { ServerStartStep } from './start/plan-server-start';
import { runServerStart } from './start/run-server-start';
import type { McpContext, OnPinMoved, ServerFacts } from './types';

export interface McpOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly now: () => number;
  readonly store: CredentialStore;
  readonly backend: Pick<HeldBackend, 'writeClient' | 'readToken' | 'removeKey'>;

  // the facts each configured server asks for, by server ID
  readonly servers: Readonly<Record<string, ServerFacts>>;
  readonly listingTimeoutSeconds: number;

  // the model names that nixie's own tools hold, which a proxied tool may not take
  readonly takenModelNames: () => ReadonlySet<string>;
  readonly onPinMoved?: OnPinMoved;
}

export type ListResult =
  | { readonly status: 'listed'; readonly tools: Readonly<Record<string, McpToolRow['state']>> }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'skipped'; readonly reason: 'not_added' | 'no_grant' | 'needs_sign_in' };

// What the API reaches: the two steps of a sign-in, and the forget of a server's credentials.
export type McpPort = Pick<Mcp, 'connect' | 'finishSignIn' | 'forgetGrants'>;

export interface Mcp {
  // the tools that the registry serves from the proxy
  readonly tools: ToolCatalog;

  // the handler of the mcp proposal family, which the API registers
  readonly makeProposalHandler: () => ProposalKindHandler;

  // At start: compares each config entry with the facts in use, and reads the tool rows.
  readonly start: () => Promise<readonly ServerStartStep[]>;
  readonly connect: (serverID: string, origin: string) => Promise<ConnectResult>;
  readonly finishSignIn: (input: FinishInput) => Promise<FinishResult>;

  // removes the credentials of a server that left, so nothing readable stays
  readonly forgetGrants: (credentialIDs: readonly string[]) => Promise<void>;

  // one listing of one server, applied to the pins
  readonly list: (serverID: string) => Promise<ListResult>;

  // writes the allow proposal of a tool that waits, as `nixie mcp allow` does
  readonly allow: (tool: string) => Promise<AllowResult>;
  readonly readServers: () => Promise<McpServerRow[]>;
  readonly readTools: (serverID?: string) => Promise<McpToolRow[]>;
}

// The MCP proxy as far as this build goes: the servers' facts and approvals, the sign-in, the
// listing and its pins, and the registry's source of tools.
export function startMcp(options: McpOptions): Mcp {
  const context: McpContext = {
    log: options.log,
    definitions: options.definitions,
    now: options.now,
  };

  const timeoutMs = options.listingTimeoutSeconds * 1000;
  const tools = createToolCatalog(options.log);
  const runtime: BindingsRuntime = { store: options.store, timeoutMs, discoveries: new Map() };

  // a listing of a server runs one at a time, and a caller that arrives meanwhile awaits it
  const listings = new Map<string, Promise<ListResult>>();

  const forgetCredentials = (ids: readonly string[]) =>
    forgetGrants({ store: options.store, backend: options.backend }, ids);

  const list = (serverID: string): Promise<ListResult> => {
    const running = listings.get(serverID);

    if (running !== undefined) {
      return running;
    }

    const started = runOneListing(serverID);

    listings.set(serverID, started);

    return started;
  };

  const runOneListing = async (serverID: string): Promise<ListResult> => {
    try {
      return await runListing(serverID);
    } finally {
      listings.delete(serverID);
    }
  };

  const runListing = async (serverID: string): Promise<ListResult> => {
    const servers = await readServerRows(options.log.writer.db);

    const server = servers.find((row) => row.server_id === serverID);

    if (server?.state !== 'added') {
      return { status: 'skipped', reason: 'not_added' };
    }

    const bound = await readBindings(runtime, server);

    if (bound.kind === 'failed') {
      return { status: 'failed', message: bound.reason };
    }

    const bindings = bound.bindings;

    const status = await options.store.readStatus(bindings.grant);

    if (status === null) {
      return { status: 'skipped', reason: 'no_grant' };
    }

    if (status.status === 'needs_consent') {
      return { status: 'skipped', reason: 'needs_sign_in' };
    }

    const outcome = await listServerTools({
      url: bindings.facts.url,
      send: options.store.fetcher(
        bindings.grant,
        [new URL(bindings.facts.url).origin],
        buildFetchOptions(bindings.facts),
      ),
      timeoutMs,
    });

    if (outcome.kind === 'failed') {
      return { status: 'failed', message: outcome.message };
    }

    const plans = await applyListing(
      { context, ...(options.onPinMoved === undefined ? {} : { onPinMoved: options.onPinMoved }) },
      {
        serverID,
        isTrusted: bindings.facts.trusted,
        forms: outcome.forms,
        takenModelNames: options.takenModelNames(),
      },
    );

    await tools.refresh();

    return {
      status: 'listed',
      tools: Object.fromEntries(plans.map((plan) => [plan.tool, plan.decision.state])),
    };
  };

  const signIn = createSignIn({
    context,
    store: options.store,
    backend: options.backend,
    runtime,
    onSignedIn: async (serverID) => {
      await list(serverID);
    },
  });

  return {
    tools,
    makeProposalHandler: () =>
      makeMcpProposalHandler({
        ...context,
        forgetCredentials,
        ...(options.onPinMoved === undefined ? {} : { onPinMoved: options.onPinMoved }),
      }),
    start: async () => {
      const steps = await runServerStart(context, {
        config: options.servers,
        forgetCredentials,
      });

      await tools.refresh();

      subscribeToChanged(options.log.writer, (topics) => {
        if (topics.includes('mcp')) {
          void tools.refresh();
        }
      });

      return steps;
    },
    connect: signIn.connect,
    finishSignIn: signIn.finish,
    forgetGrants: forgetCredentials,
    list,
    allow: (tool) => allowTool(context, tool),
    readServers: () => readServerRows(options.log.writer.db),
    readTools: (serverID) => readToolRows(options.log.writer.db, serverID),
  };
}
