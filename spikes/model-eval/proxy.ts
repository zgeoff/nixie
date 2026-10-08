// Forwards a profile's requests to its endpoint and drops the system blocks that the CLI adds before
// the persona, so a non-Anthropic model sees only the persona as its system prompt.
const cliBlocks = new Set([
    "You are Claude Code, Anthropic's official CLI for Claude.",
    "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.",
    "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
  ]),
  proxies = new Map<string, string>();

interface TextBlock {
  text?: string;
}

function isCliBlock(block: TextBlock): boolean {
  const text = block.text ?? '';
  return text.startsWith('x-anthropic-billing-header:') || cliBlocks.has(text);
}

function transformBody(body: string): string {
  try {
    const request = JSON.parse(body) as { system?: TextBlock[] | string };
    if (Array.isArray(request.system)) {
      request.system = request.system.filter((block) => !isCliBlock(block));
    }
    return JSON.stringify(request);
  } catch {
    return body;
  }
}

async function readBody(request: Request): Promise<string | undefined> {
  if (request.method !== 'POST') {
    return undefined;
  }
  const text = await request.text();
  return transformBody(text);
}

async function sendUpstream(target: string, request: Request): Promise<Response> {
  const body = await readBody(request),
    headers = new Headers(request.headers),
    url = new URL(request.url);

  // Ask for an uncompressed reply: fetch would decompress it but keep the encoding header.
  headers.delete('accept-encoding');
  headers.delete('content-length');
  headers.delete('host');
  return fetch(`${target}${url.pathname}${url.search}`, { body, headers, method: request.method });
}

function createProxy(target: string): string {
  const server = Bun.serve({
    fetch: (request) => sendUpstream(target.replace(/\/$/u, ''), request),
    hostname: '127.0.0.1',

    // A thinking model can stay silent for longer than Bun's 10 s default before its first byte.
    idleTimeout: 255,
    port: 0,
  });

  // The proxy must not keep the process alive once the run is done.
  server.unref();
  proxies.set(target, `http://127.0.0.1:${server.port}`);
  return `http://127.0.0.1:${server.port}`;
}

// Starts one proxy for each endpoint in this process and returns its local base URL.
export function startProxy(target: string): string {
  return proxies.get(target) ?? createProxy(target);
}
