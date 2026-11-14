import type { SummarizeFrame, TurnFrame } from '../turn/build-query-options';
import { rewriteModelRequest } from './rewrite-model-request';

export interface RequestRewriter {
  // the base URL that the CLI sends its requests to
  readonly url: string;

  // resolves with the first refusal, and never rejects
  readonly refused: Promise<Error>;

  readonly stop: () => Promise<void>;
}

export interface RequestRewriterOptions {
  // 0 takes a free port
  readonly port?: number;
}

const modelListPath = '/v1/models';

// The rewriter's own requests leave through Bun's fetch, which reads the proxy variables of the
// guest's environment, as the CLI does, so the sandbox's broker adds the model credential.
export function startRequestRewriter(
  frame: TurnFrame | SummarizeFrame,
  options: RequestRewriterOptions = {},
): RequestRewriter | null {
  const rewrite = frame.profile.requestRewrite;

  if (rewrite === null) {
    return null;
  }

  const refusal = Promise.withResolvers<Error>();
  const state: { refusal: string | null } = { refusal: null };
  const upstream = frame.profile.baseURL.replace(/\/$/u, '');
  const model = frame.profile.model;
  const providerPin = rewrite.providerPin;

  const refuse = (text: string): Response => {
    state.refusal ??= text;

    refusal.resolve(new Error(state.refusal));

    return renderRefusal(state.refusal);
  };

  const answerRequest = async (request: Request): Promise<Response> => {
    if (state.refusal !== null) {
      return refuse(state.refusal);
    }

    const url = new URL(request.url);

    const target = `${upstream}${url.pathname}${url.search}`;

    if (request.method === 'GET' && url.pathname === modelListPath) {
      return sendUpstream(target, request, null);
    }

    const endpoint = pickEndpoint(request.method, url.pathname);

    if (endpoint === null) {
      return refuse(
        `nixie refused a model request to ${model}: it can show the removal only on messages and token counts, so it refuses ${request.method} ${url.pathname}`,
      );
    }

    const text = await request.text();

    const result = rewriteModelRequest(endpoint, text, {
      model,
      systemPrompt: frame.systemPrompt,
      providerPin,
    });

    return result.ok ? sendUpstream(target, request, result.body) : refuse(result.error);
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: options.port ?? 0,
    fetch: answerRequest,
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    refused: refusal.promise,
    stop: async () => {
      await server.stop(true);
    },
  };
}

function renderRefusal(message: string): Response {
  return Response.json(
    { type: 'error', error: { type: 'invalid_request_error', message } },
    { status: 400 },
  );
}

async function sendUpstream(
  target: string,
  request: Request,
  body: string | null,
): Promise<Response> {
  const headers = new Headers(request.headers);

  headers.delete('host');
  headers.delete('content-length');

  try {
    const response = await fetch(target, { method: request.method, headers, body });

    const relayed = new Headers(response.headers);

    // Bun's fetch decodes the body, so both headers describe bytes that no longer arrive.
    relayed.delete('content-encoding');
    relayed.delete('content-length');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: relayed,
    });
  } catch (error) {
    return Response.json(
      {
        type: 'error',
        error: { type: 'api_error', message: `the model request failed: ${String(error)}` },
      },
      { status: 502 },
    );
  }
}

const messagesPath = '/v1/messages';
const countTokensPath = '/v1/messages/count_tokens';

function pickEndpoint(method: string, path: string): 'messages' | 'count_tokens' | null {
  if (method !== 'POST') {
    return null;
  }

  if (path === messagesPath) {
    return 'messages';
  }

  return path === countTokensPath ? 'count_tokens' : null;
}
