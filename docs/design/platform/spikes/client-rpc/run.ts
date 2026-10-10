/* oxlint-disable one-var, sort-vars, no-await-in-loop, max-statements -- the checks run one after another */
// Runs the checks against both transports and prints what each one showed.
// Usage: bun run.ts
import { ORPCError, createORPCClient, isDefinedError, safe } from '@orpc/client';
import { RPCLink as FetchLink } from '@orpc/client/fetch';
import type { ClientRetryPluginContext } from '@orpc/client/plugins';
import { ClientRetryPlugin } from '@orpc/client/plugins';
import { RPCLink as WsLink } from '@orpc/client/websocket';
import type { ContractRouterClient } from '@orpc/contract';
import type { LogRecord, contract } from './contract.ts';
import { SESSION_TOKEN, startHttp, startWs, writeRecord } from './server.ts';

type Client = ContractRouterClient<typeof contract, ClientRetryPluginContext>;

const HTTP_PORT = 4810,
  WS_PORT = 4811,
  fetchCalls = { count: 0 };

function createFetchClient(token: string): Client {
  const link = new FetchLink<ClientRetryPluginContext>({
    // The hook an Expo app on SDK 53 to 55 uses to pass expo/fetch.
    fetch: (request, init) => {
      fetchCalls.count += 1;
      return fetch(request, init);
    },
    headers: { authorization: `Bearer ${token}` },
    plugins: [new ClientRetryPlugin()],
    url: `http://localhost:${HTTP_PORT}/rpc`,
  });
  return createORPCClient(link);
}

function createWsClient(token: string): Client {
  const websocket = new WebSocket(`ws://localhost:${WS_PORT}`, [token]);
  websocket.binaryType = 'arraybuffer';
  return createORPCClient(new WsLink({ websocket }));
}

function getMedian(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function getPercentile(values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Number.NaN;
}

async function checkCalls(name: string, client: Client): Promise<void> {
  const clientMessageId = crypto.randomUUID(),
    message = {
      clientMessageId,
      spans: [{ end: 5, source: 'pasted' as const, start: 0 }],
      text: 'hello',
      thread: 'main',
    },
    first = await client.conversation.send(message),
    second = await client.conversation.send(message);
  console.log(`${name} send: first=${JSON.stringify(first)} resend=${JSON.stringify(second)}`);

  const [error] = await safe(client.approvals.approve({ actionHash: 'stale', proposalId: 'p1' }));
  console.log(
    `${name} approve with a stale hash: defined=${isDefinedError(error)} code=${error instanceof ORPCError ? error.code : String(error)}`,
  );
}

async function checkLatency(name: string, client: Client, start: number): Promise<void> {
  const controller = new AbortController(),
    stamps = new Map<number, number>(),
    gaps: number[] = [],
    total = 200,
    iterator = await client.log.follow({ after: start }, { signal: controller.signal });
  const reader = (async () => {
    for await (const record of iterator) {
      const sentAt = stamps.get(record.sequence);
      if (sentAt !== undefined) {
        gaps.push(performance.now() - sentAt);
      }
      if (gaps.length === total) {
        break;
      }
    }
  })();
  for (let index = 0; index < total; index += 1) {
    const record = writeRecord('main', 'turn_text', `chunk ${index}`);
    stamps.set(record.sequence, performance.now());
    await Bun.sleep(2);
  }
  await reader.catch(() => null);
  console.log(
    `${name} append to client: n=${gaps.length} median=${getMedian(gaps).toFixed(2)}ms p95=${getPercentile(gaps, 0.95).toFixed(2)}ms`,
  );
}

async function checkUnauthorized(name: string, client: Client): Promise<void> {
  const [error] = await safe(
    client.conversation.send({ clientMessageId: 'x', spans: [], text: 'x', thread: 'main' }),
  );
  console.log(
    `${name} wrong session: code=${error instanceof ORPCError ? error.code : String(error)}`,
  );
}

// Restarts the HTTP server mid-stream and checks that the retry plugin resumes from the last
// event id with no gap and no duplicate.
async function checkResume(): Promise<void> {
  let app = startHttp(HTTP_PORT);
  const client = createFetchClient(SESSION_TOKEN),
    start = writeRecord('main', 'marker', 'resume start').sequence,
    seen: number[] = [],
    controller = new AbortController(),
    iterator = await client.log.follow(
      { after: start },
      { context: { retry: Number.POSITIVE_INFINITY }, signal: controller.signal },
    );
  const reader = (async () => {
    for await (const record of iterator as AsyncIterable<LogRecord>) {
      seen.push(record.sequence);
      if (seen.length === 30) {
        break;
      }
    }
  })();
  for (let index = 0; index < 10; index += 1) {
    writeRecord('main', 'turn_text', `before ${index}`);
  }
  await Bun.sleep(100);
  await app.stop(true);
  for (let index = 0; index < 10; index += 1) {
    writeRecord('main', 'turn_text', `while down ${index}`);
  }
  await Bun.sleep(300);
  app = startHttp(HTTP_PORT);
  for (let index = 0; index < 10; index += 1) {
    writeRecord('main', 'turn_text', `after ${index}`);
  }
  await Promise.race([reader.catch(() => null), Bun.sleep(5000)]);
  controller.abort();
  const expected = Array.from({ length: 30 }, (_, index) => start + 1 + index),
    missing = expected.filter((sequence) => !seen.includes(sequence)),
    duplicates = seen.length - new Set(seen).size;
  console.log(
    `fetch resume across a server restart: received=${seen.length} missing=${missing.length} duplicates=${duplicates}`,
  );
  await app.stop(true);
}

const http = startHttp(HTTP_PORT),
  ws = startWs(WS_PORT),
  fetchClient = createFetchClient(SESSION_TOKEN),
  wsClient = createWsClient(SESSION_TOKEN);

await checkCalls('fetch', fetchClient);
await checkCalls('ws', wsClient);
await checkUnauthorized('fetch', createFetchClient('wrong'));
await checkUnauthorized('ws', createWsClient('wrong'));
await checkLatency('fetch', fetchClient, writeRecord('main', 'marker', 'fetch latency').sequence);
await checkLatency('ws', wsClient, writeRecord('main', 'marker', 'ws latency').sequence);
console.log(`fetch override called ${fetchCalls.count} times`);
await http.stop(true);
await checkResume();
await ws.stop(true);
process.exit(0);
