import { createHash } from 'node:crypto';
import { startTestSite } from '@heynixie/egress/test-utils';
import { z } from 'zod';

export interface StandInTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly annotations?: Record<string, unknown>;

  // what a call to the tool answers; `called <name>` as text when absent. The listing leaves it out.
  readonly answer?: {
    readonly content: readonly Record<string, unknown>[];
    readonly structuredContent?: Record<string, unknown>;
    readonly isError?: boolean;
  };
}

export interface StandInCall {
  readonly tool: string;
  readonly args: unknown;
  readonly authorization: string | null;
}

export interface StandInMcpSite {
  readonly host: string;
  readonly origin: string;
  readonly mcpURL: string;
  readonly ca: string;
  readonly clientID: string;

  // the tools of the next listing and each listing after it
  readonly setTools: (tools: readonly StandInTool[]) => void;

  // from the next request on, the listing answers 503 while the flag holds
  readonly failListings: (isFailing: boolean) => void;

  // from the next request on, the refresh grant answers invalid_grant while the flag holds
  readonly refuseRefresh: (isRefusing: boolean) => void;

  // from the next discovery on, the token endpoint sits at another path
  readonly moveTokenEndpoint: (isMoved: boolean) => void;

  // from the next request on, each listing page holds no tool and names another page, after the delay
  readonly serveEndlessPages: (delayMs: number | null) => void;

  // Runs the hook while a call to the tool is in flight, before the site answers it. A test moves
  // the pin there, as a listing that lands in the middle of a call does.
  readonly onCall: (hook: (() => Promise<void>) | null) => void;

  // Runs the hook while the next session opens, before the site answers its initialize request. A
  // test moves the pin there, as a listing that lands while a call opens its session does.
  readonly onInitialize: (hook: (() => Promise<void>) | null) => void;

  // from the next request on, the MCP endpoint answers 401 to every token, fresh ones included
  readonly rejectTokens: (isRejecting: boolean) => void;

  // every access token issued so far stops working, as an expired one does
  readonly expireAccessTokens: () => void;
  readonly calls: readonly StandInCall[];
  readonly tokenRequests: readonly Readonly<Record<string, string>>[];

  // the access token that the last token request issued
  readonly readLatestAccessToken: () => string | null;
  readonly readListingCount: () => number;
}

export interface StandInMcpSiteOptions {
  readonly tools?: readonly StandInTool[];

  // whether the authorization server's metadata says that its return carries `iss`; default true
  readonly advertisesIssuer?: boolean;
}

interface SiteState {
  readonly advertisesIssuer: boolean;
  tools: readonly StandInTool[];
  callHook: (() => Promise<void>) | null;
  initializeHook: (() => Promise<void>) | null;
  isListingFailing: boolean;
  isRejectingTokens: boolean;
  isRefreshRefused: boolean;
  isTokenEndpointMoved: boolean;
  endlessPageDelayMs: number | null;
  readonly accessTokens: Set<string>;
  readonly refreshTokens: Set<string>;
  readonly codes: Map<string, { challenge: string; redirectURI: string }>;
  issued: number;
  listings: number;
  latestAccessToken: string | null;
}

// A real local HTTPS site that plays one MCP server and the authorization server that guards it:
// Streamable HTTP at /mcp, OAuth 2.1 with the authorization code grant and PKCE, a public client,
// and a refresh token that rotates at each use. A test reaches it over the pinned connection.
export async function startStandInMcpSite(
  options: StandInMcpSiteOptions = {},
): Promise<StandInMcpSite> {
  const host = 'mcp.test';
  const clientID = 'nixie-stand-in';

  const state: SiteState = {
    advertisesIssuer: options.advertisesIssuer ?? true,
    tools: options.tools ?? [],
    callHook: null,
    initializeHook: null,
    isListingFailing: false,
    isRejectingTokens: false,
    isRefreshRefused: false,
    isTokenEndpointMoved: false,
    endlessPageDelayMs: null,
    accessTokens: new Set<string>(),
    refreshTokens: new Set<string>(),
    codes: new Map<string, { challenge: string; redirectURI: string }>(),
    issued: 0,
    listings: 0,
    latestAccessToken: null,
  };

  const calls: StandInCall[] = [];
  const tokenRequests: Record<string, string>[] = [];
  const origin = { value: '' };

  const site = await startTestSite({
    names: [host],
    respond: (request) =>
      answerRequest({ request, origin: origin.value, state, calls, tokenRequests, clientID }),
  });

  origin.value = `https://${host}:${String(site.port)}`;

  return {
    host,
    origin: origin.value,
    mcpURL: `${origin.value}/mcp`,
    ca: site.ca,
    clientID,
    setTools: (tools) => {
      state.tools = tools;
    },
    onCall: (hook) => {
      state.callHook = hook;
    },
    onInitialize: (hook) => {
      state.initializeHook = hook;
    },
    failListings: (isFailing) => {
      state.isListingFailing = isFailing;
    },
    rejectTokens: (isRejecting) => {
      state.isRejectingTokens = isRejecting;
    },
    refuseRefresh: (isRefusing) => {
      state.isRefreshRefused = isRefusing;
    },
    moveTokenEndpoint: (isMoved) => {
      state.isTokenEndpointMoved = isMoved;
    },
    serveEndlessPages: (delayMs) => {
      state.endlessPageDelayMs = delayMs;
    },
    expireAccessTokens: () => {
      state.accessTokens.clear();
    },
    calls,
    tokenRequests,
    readLatestAccessToken: () => state.latestAccessToken,
    readListingCount: () => state.listings,
  };
}

interface SiteRequest {
  readonly request: Request;
  readonly origin: string;
  readonly state: SiteState;
  readonly calls: StandInCall[];
  readonly tokenRequests: Record<string, string>[];
  readonly clientID: string;
}

function answerRequest(site: SiteRequest): Promise<Response> | Response {
  const url = new URL(site.request.url);

  const path = url.pathname;

  if (path.startsWith('/.well-known/oauth-protected-resource')) {
    return Response.json({
      resource: `${site.origin}/mcp`,
      authorization_servers: [site.origin],
    });
  }

  if (path.startsWith('/.well-known/oauth-authorization-server')) {
    return Response.json({
      issuer: site.origin,
      authorization_endpoint: `${site.origin}/authorize`,
      token_endpoint: `${site.origin}${site.state.isTokenEndpointMoved ? '/token-moved' : '/token'}`,
      revocation_endpoint: `${site.origin}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      authorization_response_iss_parameter_supported: site.state.advertisesIssuer,
    });
  }

  if (path === '/authorize') {
    return answerAuthorize(site, url);
  }

  if (path === '/token' || path === '/token-moved') {
    return answerToken(site);
  }

  if (path === '/revoke') {
    return new Response(null, { status: 200 });
  }

  if (path === '/mcp') {
    return answerMcp(site);
  }

  return new Response('not found', { status: 404 });
}

// The owner's passkey sign-in is out of the test's reach, so the page approves at once and sends the
// browser back with a code.
function answerAuthorize(site: SiteRequest, url: URL): Response {
  const params = url.searchParams;
  const redirectURI = params.get('redirect_uri');
  const challenge = params.get('code_challenge');

  const isValid =
    params.get('client_id') === site.clientID &&
    params.get('response_type') === 'code' &&
    params.get('code_challenge_method') === 'S256' &&
    params.get('resource') === `${site.origin}/mcp` &&
    redirectURI !== null &&
    challenge !== null;

  if (!isValid) {
    return new Response('the authorize request is not valid', { status: 400 });
  }

  const code = crypto.randomUUID();

  site.state.codes.set(code, { challenge, redirectURI });

  const back = new URL(redirectURI);

  back.searchParams.set('code', code);
  back.searchParams.set('state', params.get('state') ?? '');
  back.searchParams.set('iss', site.origin);

  return new Response(null, { status: 302, headers: { location: back.href } });
}

async function answerToken(site: SiteRequest): Promise<Response> {
  const body = await site.request.text();

  const form = Object.fromEntries(new URLSearchParams(body));

  site.tokenRequests.push(form);

  if (form['resource'] !== `${site.origin}/mcp` || form['client_id'] !== site.clientID) {
    return Response.json({ error: 'invalid_target' }, { status: 400 });
  }

  if (form['grant_type'] === 'authorization_code') {
    return answerCodeGrant(site, form);
  }

  const refreshToken = form['refresh_token'] ?? '';

  if (site.state.isRefreshRefused || !site.state.refreshTokens.delete(refreshToken)) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  }

  return issueTokens(site);
}

function answerCodeGrant(site: SiteRequest, form: Record<string, string>): Response {
  const pending = site.state.codes.get(form['code'] ?? '');

  site.state.codes.delete(form['code'] ?? '');

  const challenge = createHash('sha256')
    .update(form['code_verifier'] ?? '')
    .digest('base64url');

  const isValid =
    pending !== undefined &&
    pending.challenge === challenge &&
    pending.redirectURI === form['redirect_uri'] &&
    form['client_secret'] === undefined;

  return isValid ? issueTokens(site) : Response.json({ error: 'invalid_grant' }, { status: 400 });
}

function issueTokens(site: SiteRequest): Response {
  site.state.issued += 1;

  const accessToken = `stand-in-access-${String(site.state.issued)}`;
  const refreshToken = `stand-in-refresh-${String(site.state.issued)}`;

  site.state.accessTokens.add(accessToken);
  site.state.refreshTokens.add(refreshToken);

  site.state.latestAccessToken = accessToken;

  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 900,
    refresh_token: refreshToken,
  });
}

const rpcMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z
    .object({
      name: z.string().optional(),
      arguments: z.unknown().optional(),
      protocolVersion: z.string().optional(),
    })
    .optional(),
});

async function answerMcp(site: SiteRequest): Promise<Response> {
  const authorization = site.request.headers.get('authorization');
  const token = authorization?.replace(/^Bearer /u, '') ?? '';

  if (site.state.isRejectingTokens || !site.state.accessTokens.has(token)) {
    return new Response('unauthorised', {
      status: 401,
      headers: {
        'www-authenticate': `Bearer resource_metadata="${site.origin}/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  }

  if (site.request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const raw: unknown = await site.request.json();

  const message = rpcMessageSchema.parse(raw);

  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }

  return answerRPC(site, message, authorization);
}

type RPCMessage = z.infer<typeof rpcMessageSchema>;

function answerRPC(
  site: SiteRequest,
  message: RPCMessage,
  authorization: string | null,
): Response | Promise<Response> {
  const id = message.id ?? null;

  if (message.method === 'initialize') {
    const asked = message.params?.protocolVersion;

    return runInitializeHook(site).then(() =>
      Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: typeof asked === 'string' ? asked : '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'stand-in', version: '1.0.0' },
        },
      }),
    );
  }

  if (message.method === 'tools/list') {
    site.state.listings += 1;

    if (site.state.endlessPageDelayMs !== null) {
      return answerEndlessPage(id, site.state.endlessPageDelayMs, site.state.listings);
    }

    return site.state.isListingFailing
      ? new Response('down', { status: 503 })
      : Response.json({
          jsonrpc: '2.0',
          id,
          result: { tools: site.state.tools.map(toListedTool) },
        });
  }

  if (message.method === 'tools/call') {
    const tool = message.params?.name ?? '';

    site.calls.push({ tool, args: message.params?.arguments, authorization });

    const answer = site.state.tools.find((candidate) => candidate.name === tool)?.answer;

    return runCallHook(site).then(() =>
      Response.json({
        jsonrpc: '2.0',
        id,
        result: answer ?? {
          content: [{ type: 'text', text: `called ${tool}` }],
          isError: tool === 'fails',
        },
      }),
    );
  }

  return Response.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32_601, message: 'method not found' },
  });
}

async function runInitializeHook(site: SiteRequest): Promise<void> {
  const hook = site.state.initializeHook;

  site.state.initializeHook = null;

  await hook?.();
}

async function answerEndlessPage(
  id: string | number | null,
  delayMs: number,
  page: number,
): Promise<Response> {
  await Bun.sleep(delayMs);

  return Response.json({
    jsonrpc: '2.0',
    id,
    result: { tools: [], nextCursor: `page-${String(page)}` },
  });
}

// The tool as a listing shows it, which leaves out what a call answers.
function toListedTool(tool: StandInTool): Omit<StandInTool, 'answer'> {
  const { answer: _answer, ...listed } = tool;

  return listed;
}

async function runCallHook(site: SiteRequest): Promise<void> {
  const hook = site.state.callHook;

  site.state.callHook = null;

  await hook?.();
}
