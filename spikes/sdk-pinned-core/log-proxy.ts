// Forwards to Z.ai's Anthropic-compatible endpoint and logs which code word each request's system
// prompt holds, so a run shows what the model received beside what it answered.
// Usage: bun log-proxy.ts, then run pinned-core.ts with NIXIE_SPIKE_BASE_URL=http://127.0.0.1:47900
const counter = { requests: 0 },
  target = 'https://api.z.ai/api/anthropic',
  words = ['APPLE', 'BANANA', 'CHERRY'];

function printRequest(body: string): void {
  try {
    const parsed = JSON.parse(body) as { messages?: unknown[]; system?: unknown },
      prompt = JSON.stringify(parsed.system ?? ''),
      seen = words.filter((word) => prompt.includes(`code word is ${word}`));
    counter.requests += 1;
    console.log(
      `#${counter.requests} system_word=${seen.join(',') || 'none'} messages=${parsed.messages?.length ?? 0}`,
    );
  } catch {
    console.log('unparsed request');
  }
}

async function sendUpstream(request: Request): Promise<Response> {
  const body = request.method === 'POST' ? await request.text() : undefined,
    headers = new Headers(request.headers),
    url = new URL(request.url);
  if (body && url.pathname.endsWith('/messages')) {
    printRequest(body);
  }
  headers.set('accept-encoding', 'identity');
  headers.delete('content-length');
  headers.delete('host');
  return fetch(`${target}${url.pathname}${url.search}`, { body, headers, method: request.method });
}

Bun.serve({ fetch: sendUpstream, hostname: '127.0.0.1', idleTimeout: 255, port: 47_900 });
console.log('listening on 127.0.0.1:47900');
