import type { ActionConnector } from '@heynixie/connectors';
import type { CredentialStore, HeldBackend } from '@heynixie/credentials';
import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { subscribeToChanged } from '@heynixie/log';
import type { ProposalKindHandler } from '@heynixie/proposals';
import { renderChangedSentence } from '@heynixie/tools';
import { buildActionConnector } from './call/build-action-connector';
import { pickCallGate } from './call/pick-call-gate';
import { runServerCall } from './call/run-server-call';
import type { ProxyCalls } from './call/types';
import { createHealthTracker } from './health/create-health-tracker';
import type { ServerHealth } from './health/types';
import { applyListing } from './listing/apply-listing';
import { listServerTools } from './listing/list-server-tools';
import { refitTools } from './listing/refit-tools';
import { readNotices } from './notice/read-notices';
import type { McpNotice } from './notice/read-notices';
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
import type { McpContext, OnPinMoved, ReadOverrides, ServerFacts } from './types';

export interface McpOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly now: () => number;
  readonly store: CredentialStore;
  readonly backend: Pick<HeldBackend, 'writeClient'>;

  // the facts each configured server asks for, by server ID
  readonly servers: Readonly<Record<string, ServerFacts>>;
  readonly listingTimeoutSeconds: number;

  // the model names that nixie's own tools hold, which a proxied tool may not take
  readonly takenModelNames: () => ReadonlySet<string>;
  readonly onPinMoved?: OnPinMoved;

  // The override files of the definitions in force. Absent, every tool runs under its annotations.
  readonly readOverrides?: ReadOverrides;

  // a time as the owner reads it in an error to the model, such as 14:05; UTC when absent
  readonly formatTime?: (timeMs: number) => string;
}

export type ListResult =
  | { readonly status: 'listed'; readonly tools: Readonly<Record<string, McpToolRow['state']>> }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'skipped'; readonly reason: 'not_added' | 'no_grant' | 'needs_sign_in' };

// What the API reaches: the two steps of a sign-in, and the forget of a server's credentials.
export type McpPort = Pick<
  Mcp,
  'connect' | 'finishSignIn' | 'forgetGrants' | 'allow' | 'readNotices'
>;

// One line of the model's view of the servers.
export interface McpServerSummary {
  readonly server: string;
  readonly state: 'held' | 'added';
  readonly signIn: 'ok' | 'needs_sign_in' | 'not_added';
  readonly health: 'healthy' | 'unhealthy';
  readonly tools: { readonly exposed: number; readonly stopped: number; readonly hidden: number };
}

export interface Mcp {
  // the tools that the registry serves from the proxy
  readonly tools: ToolCatalog;

  // the handler of the mcp proposal family, which the API registers
  readonly makeProposalHandler: () => ProposalKindHandler;

  // At start: compares each config entry with the facts in use, and reads the tool rows.
  readonly start: () => Promise<readonly ServerStartStep[]>;

  // stops the retries of failed servers
  readonly stop: () => void;
  readonly connect: (serverID: string, origin: string) => Promise<ConnectResult>;
  readonly finishSignIn: (input: FinishInput) => Promise<FinishResult>;

  // removes the credentials of a server that left, so nothing readable stays
  readonly forgetGrants: (credentialIDs: readonly string[]) => Promise<void>;

  // Judges each pinned tool against the override files in force again, and serves each tool under
  // them, as a new seed of the definitions needs.
  readonly refit: () => Promise<void>;

  // one listing of one server, applied to the pins
  readonly list: (serverID: string) => Promise<ListResult>;

  // writes the allow proposal of a tool that waits, as `nixie mcp allow` does
  readonly allow: (tool: string) => Promise<AllowResult>;

  // the newest notices of changes that applied with no allow, newest first
  readonly readNotices: (limit: number) => Promise<McpNotice[]>;
  readonly readServers: () => Promise<McpServerRow[]>;
  readonly readTools: (serverID?: string) => Promise<McpToolRow[]>;

  // what the proxy knows of the newest server listings of one server: how many failed in a row, the
  // next try and the last error
  readonly readHealth: (serverID: string) => ServerHealth;

  // every server that is not removed, as the model reads it
  readonly readSummaries: () => Promise<McpServerSummary[]>;

  // the connector of a proxied tool that the action runners run once you approve a call, or
  // undefined for a tool the proxy does not serve
  readonly findConnector: (tool: string) => ActionConnector | undefined;
}

const callTimeoutMs = 60_000;

// The MCP proxy: the servers' facts and approvals, the sign-in, the listing and its pins, the
// registry's source of tools, and the calls that pass through their health.
export function startMcp(options: McpOptions): Mcp {
  const context: McpContext = {
    log: options.log,
    definitions: options.definitions,
    now: options.now,
  };

  const timeoutMs = options.listingTimeoutSeconds * 1000;

  const readOverrides: ReadOverrides =
    options.readOverrides ??
    (() => Promise.resolve({ definitionsHash: options.definitions().snapshotHash, servers: {} }));

  const runtime: BindingsRuntime = { store: options.store, timeoutMs, discoveries: new Map() };

  // a listing of a server runs one at a time, and a caller that arrives meanwhile awaits it
  const listings = new Map<string, Promise<ListResult>>();

  // whether the newest listing of each server found its grant signed in
  const signIns = new Map<string, 'ok' | 'needs_sign_in'>();

  const removeCredentials = (ids: readonly string[]) => forgetGrants({ store: options.store }, ids);
  const formatTime = options.formatTime ?? formatUTCTime;

  const list = (serverID: string): Promise<ListResult> => {
    const running = listings.get(serverID);

    if (running !== undefined) {
      return running;
    }

    const started = runOneListing(serverID);

    listings.set(serverID, started);

    return started;
  };

  const health = createHealthTracker(context, list);

  const runOneListing = async (serverID: string): Promise<ListResult> => {
    try {
      return await runListing(serverID);
    } finally {
      listings.delete(serverID);
    }
  };

  // The server's URL with a fetcher that adds its access token, or why the server cannot be reached.
  const openServer = async (serverID: string) => {
    const servers = await readServerRows(options.log.writer.db);

    const server = servers.find((row) => row.server_id === serverID);

    if (server?.state !== 'added') {
      signIns.set(serverID, 'ok');

      return { kind: 'skipped' as const, reason: 'not_added' as const };
    }

    const bound = await readBindings(runtime, server);

    if (bound.kind === 'failed') {
      return { kind: 'failed' as const, message: bound.reason };
    }

    const bindings = bound.bindings;

    const status = await options.store.readStatus(bindings.grant);

    if (status === null) {
      signIns.set(serverID, 'needs_sign_in');

      return { kind: 'skipped' as const, reason: 'no_grant' as const };
    }

    if (status.status === 'needs_consent' || bindings.hasMoved) {
      signIns.set(serverID, 'needs_sign_in');

      return { kind: 'skipped' as const, reason: 'needs_sign_in' as const };
    }

    signIns.set(serverID, 'ok');

    return {
      kind: 'open' as const,
      url: bindings.facts.url,
      isTrusted: bindings.facts.trusted,
      send: options.store.fetcher(
        bindings.grant,
        [new URL(bindings.facts.url).origin],
        buildFetchOptions(bindings.facts),
      ),
    };
  };

  const runListing = async (serverID: string): Promise<ListResult> => {
    const opened = await openServer(serverID);

    if (opened.kind === 'skipped') {
      if (opened.reason !== 'not_added') {
        await health.record(serverID, { kind: 'needs_sign_in' });
      }

      return { status: 'skipped', reason: opened.reason };
    }

    if (opened.kind === 'failed') {
      await health.record(serverID, { kind: 'failed', cause: 'error' });

      return { status: 'failed', message: opened.message };
    }

    const outcome = await listServerTools({ url: opened.url, send: opened.send, timeoutMs });

    if (outcome.kind === 'failed') {
      // The grant decides whether the server needs a sign-in: the store marks it when a refresh is
      // refused for good, whatever status the listing got.
      const grant = await openServer(serverID);

      if (grant.kind === 'skipped' && grant.reason !== 'not_added') {
        await health.record(serverID, { kind: 'needs_sign_in' });

        return { status: 'skipped', reason: grant.reason };
      }

      await health.record(serverID, { kind: 'failed', cause: outcome.cause });

      return { status: 'failed', message: outcome.message };
    }

    const inForce = await readOverrides(options.log.writer.db);

    const plans = await applyListing(
      { context, ...(options.onPinMoved === undefined ? {} : { onPinMoved: options.onPinMoved }) },
      {
        serverID,
        isTrusted: opened.isTrusted,
        forms: outcome.forms,
        takenModelNames: options.takenModelNames(),
        overrides: Object.hasOwn(inForce.servers, serverID)
          ? (inForce.servers[serverID] ?? {})
          : {},
      },
    );

    await health.record(serverID, { kind: 'passed' });
    await tools.refresh();

    return {
      status: 'listed',
      tools: Object.fromEntries(plans.map((plan) => [plan.tool, plan.decision.state])),
    };
  };

  const readGate = async (tool: string) => {
    const serverID = tool.split('.')[0] ?? '';

    const [servers, rows] = await Promise.all([
      readServerRows(options.log.writer.db),
      readToolRows(options.log.writer.db, serverID),
    ]);

    const toolRow = rows.find((row) => row.tool === tool) ?? null;

    const gate = pickCallGate({
      serverID,
      tool,
      server: servers.find((row) => row.server_id === serverID) ?? null,
      toolRow,
      health: health.read(serverID),
      signIn: signIns.get(serverID) ?? 'ok',
      nowMs: options.now(),
      formatTime,
    });

    return { gate, pinnedHash: toolRow?.pinned_hash ?? null };
  };

  // The sentence that refuses a call once its session is open, or null when the tool is still open
  // under the pin the call was checked against. A listing may have moved either while it opened.
  const readPinRefusal = async (tool: string, pinnedHash: string): Promise<string | null> => {
    const read = await readGate(tool);

    if (read.gate.kind === 'refused') {
      return read.gate.text;
    }

    return read.gate.kind === 'open' && read.pinnedHash === pinnedHash
      ? null
      : renderChangedSentence(tool);
  };

  const clear: ProxyCalls['clear'] = async (tool) => {
    const serverID = tool.split('.')[0] ?? '';

    // a listing the call makes may change the gate once, and a second listing never follows it
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const read = await readGate(tool);

      if (read.gate.kind === 'open') {
        return { kind: 'cleared', pinnedHash: read.pinnedHash };
      }

      if (read.gate.kind === 'refused') {
        return { kind: 'refused', text: read.gate.text };
      }

      const listed = await list(serverID);

      if (listed.status === 'skipped') {
        return {
          kind: 'refused',
          text:
            listed.reason === 'not_added'
              ? `${serverID} waits for your approval`
              : `${serverID} needs you to sign in again`,
        };
      }
    }

    return { kind: 'refused', text: `${serverID} is unreachable` };
  };

  const refit = async () => {
    await refitTools(context, readOverrides);

    await tools.refresh();
  };

  const makeApprovedCall = (tool: string) => async (input: JSONObject) => {
    const result = await tools.runApproved(tool, input);

    return result ?? { kind: 'refused' as const, text: `${tool} is not available` };
  };

  // A check reads and never writes, so it runs only a tool that declares nothing but a read.
  const runCheckTool = (tool: string, input: JSONObject) => {
    const effects = tools.findDeclaration(tool)?.declaration.effects ?? [];

    return effects.length === 1 && effects[0] === 'read'
      ? tools.runApproved(tool, input)
      : Promise.resolve(null);
  };

  const calls: ProxyCalls = {
    clear,
    send: async (tool, serverName, input, pinnedHash) => {
      const serverID = tool.split('.')[0] ?? '';

      const opened = await openServer(serverID);

      if (opened.kind === 'open') {
        const outcome = await runServerCall({
          url: opened.url,
          send: opened.send,
          name: serverName,
          input,
          timeoutMs: callTimeoutMs,
          readRefusal: () => readPinRefusal(tool, pinnedHash),
        });

        // A refresh that the authorization server refused for good ends the grant during the call.
        const grant = outcome.kind === 'failed' ? await openServer(serverID) : opened;

        return grant.kind === 'skipped' && grant.reason !== 'not_added'
          ? buildSignInRefusal(serverID)
          : outcome;
      }

      return opened.kind === 'skipped' && opened.reason !== 'not_added'
        ? buildSignInRefusal(serverID)
        : { kind: 'failed', message: 'could not be reached' };
    },
  };

  // Lists each server of the named tools before a task run reads its tool list, unless the server's
  // backoff is running.
  const prepareServers = async (serverIDs: readonly string[]): Promise<void> => {
    const due = serverIDs.filter((serverID) => {
      const nextTryAtMs = health.read(serverID).nextTryAtMs;

      return nextTryAtMs === null || nextTryAtMs <= options.now();
    });

    await Promise.allSettled(due.map((serverID) => list(serverID)));
  };

  const tools = createToolCatalog(options.log, calls, prepareServers, readOverrides);

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
        removeCredentials,
        readOverrides,
        ...(options.onPinMoved === undefined ? {} : { onPinMoved: options.onPinMoved }),
      }),
    start: async () => {
      const steps = await runServerStart(context, {
        config: options.servers,
        removeCredentials,
      });

      await health.start();

      await refitTools(context, readOverrides);

      await tools.refresh();

      subscribeToChanged(options.log.writer, (topics) => {
        if (topics.includes('definitions')) {
          void refit();
        } else if (topics.includes('mcp')) {
          void tools.refresh();
        }
      });

      return steps;
    },
    stop: () => {
      health.stop();
    },
    connect: signIn.connect,
    finishSignIn: signIn.finish,
    forgetGrants: removeCredentials,
    list,
    refit,
    allow: (tool) => allowTool(context, tool),
    readNotices: (limit) => readNotices(context, limit),
    readServers: () => readServerRows(options.log.writer.db),
    readHealth: health.read,
    readTools: (serverID) => readToolRows(options.log.writer.db, serverID),
    readSummaries: async () => {
      const [servers, rows] = await Promise.all([
        readServerRows(options.log.writer.db),
        readToolRows(options.log.writer.db),
      ]);

      return servers.flatMap((server) =>
        server.state === 'removed'
          ? []
          : [
              {
                server: server.server_id,
                state: server.state,
                signIn:
                  server.state === 'held'
                    ? ('not_added' as const)
                    : (signIns.get(server.server_id) ?? 'ok'),
                health: health.read(server.server_id).isUnhealthy
                  ? ('unhealthy' as const)
                  : ('healthy' as const),
                tools: countTools(rows.filter((row) => row.server_id === server.server_id)),
              },
            ],
      );
    },
    findConnector: (tool) => {
      const declared = tools.findDeclaration(tool);

      return declared === null
        ? undefined
        : buildActionConnector(makeApprovedCall(tool), {
            reconcile: declared.reconcile,
            serverID: tool.split('.')[0] ?? '',
            definitionsHash: declared.definitionsHash,
            runCheck: runCheckTool,
          });
    },
  };
}

function formatUTCTime(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(11, 16);
}

function buildSignInRefusal(serverID: string) {
  return { kind: 'refused' as const, text: `${serverID} needs you to sign in again` };
}

function countTools(rows: readonly McpToolRow[]) {
  return {
    exposed: rows.filter((row) => row.state === 'exposed').length,
    stopped: rows.filter((row) => row.state.startsWith('stopped_')).length,
    hidden: rows.filter((row) => row.state === 'hidden_new').length,
  };
}
