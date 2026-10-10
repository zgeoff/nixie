// oxlint-disable no-await-in-loop -- sequential lifecycle steps and measurements
// A stand-in for nixie in a pod. It serves its tools on a unix socket, opens a
// reverse forward through impd over its own outbound connection, and checks
// what a conversation imp with egress `none` reaches. It writes one JSON line
// per step on stdout.
import { lookup } from 'node:dns/promises';
import { readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { createImpClient, openReverseForward } from '@zgeoff/imp-client';
import type { ReverseForward, ReverseRelay, ReverseRelayHandlers } from '@zgeoff/imp-client';

const impURL = process.env.IMP_URL ?? '',
  impToken = readFileSync(process.env.IMP_TOKEN_FILE ?? '/var/run/imp/token', 'utf8').trim(),
  impName = process.env.SPIKE_IMP ?? '',
  image = process.env.SPIKE_IMAGE ?? '',
  guestPort = Number(process.env.SPIKE_GUEST_PORT ?? '8901'),
  socketPath = '/tmp/nixie-tools.sock',
  toolToken = crypto.randomUUID(),
  quiet = { isOn: false },
  // the impd host name and address stay out of the recorded run
  redactions: [string, string][] = [];

if (!/^https:\/\//u.test(impURL) || !impToken || !/^nixie-spike-[a-z0-9-]+$/u.test(impName) || !image) {
  throw new Error('Set IMP_URL (https), IMP_TOKEN_FILE, SPIKE_IMP (nixie-spike-*) and SPIKE_IMAGE.');
}

const client = createImpClient({ url: impURL, token: impToken }),
  startedAt = performance.now(),
  tools = startTools();
let forward: ReverseForward | null = null,
  madeImp = false,
  failed = false;

try {
  printStep('pod-sockets-before', { listeners: collectListeners() });
  printStep('impd-version', await client.checkServer());
  const existing = await client.imps.list();
  if (existing.some((row) => row.name === impName)) {
    throw new Error(`${impName} already exists; refusing to reuse it.`);
  }
  await client.imps.create({
    name: impName,
    image,
    memoryMib: 1024,
    policy: { mode: 'none', allow: [] },
  });
  madeImp = true;
  printStep('imp-created', { name: impName, image, policy: await client.imps.policy({ name: impName }) });

  forward = openReverseForward({
    baseUrl: impURL,
    token: impToken,
    name: impName,
    guest: { network: 'tcp', port: guestPort },
    connect: (url, headers) => new WebSocket(url, { headers: { ...headers } }),
    onConnection: (accept) => {
      startLocalRelay(accept);
    },
  });
  void forward.ended.then((end) => {
    printStep('forward-ended', end);
  });
  printStep('forward-listening', await forward.listening);
  printStep('pod-sockets-forward-open', { listeners: collectListeners() });

  await runGuestChecks();

  printStep('imp-policy-after', { policy: await client.imps.policy({ name: impName }) });
  printStep('pod-sockets-after', { listeners: collectListeners() });
} catch (error) {
  failed = true;
  printStep('error', { message: error instanceof Error ? error.message : String(error) });
} finally {
  forward?.stop();
  if (madeImp) {
    await client.imps.destroy({ name: impName });
    printStep('imp-destroyed', { name: impName });
  }
  await tools.stop(true);
  rmSync(socketPath, { force: true });
  printStep('done', { ok: !failed });
}

// keeps the pod alive after the run, so the operator reads its sockets and
// logs; the operator deletes the pod
await new Promise(() => {});

function startTools(): ReturnType<typeof Bun.serve> {
  rmSync(socketPath, { force: true });
  return Bun.serve({
    unix: socketPath,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (request.headers.get('authorization') !== `Bearer ${toolToken}`) {
        printStep('tool-request', { path, status: 401 });
        return new Response('unauthorized', { status: 401 });
      }
      if (path === '/stream') {
        printStep('tool-request', { path, status: 200 });
        return buildStreamResponse();
      }
      if (path === '/mcp' && request.method === 'POST') {
        const body = (await request.json()) as {
          id: number;
          method: string;
          params: { name: string; arguments: { a: number; b: number } };
        };
        if (!quiet.isOn) {
          printStep('tool-request', { path, status: 200, method: body.method, tool: body.params.name });
        }
        const sum = body.params.arguments.a + body.params.arguments.b;
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: String(sum) }],
            structuredContent: { sum, servedBy: 'nixie-pod' },
          },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });
}

function buildStreamResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('first\n'));
        await Bun.sleep(250);
        controller.enqueue(encoder.encode('last\n'));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/plain' } },
  );
}

// One guest connection, relayed to the unix socket: the pod never listens on
// a network port.
function startLocalRelay(accept: (handlers: ReverseRelayHandlers) => ReverseRelay): void {
  const socket = createConnection({ path: socketPath });
  const relay = accept({
    onData: (data) =>
      new Promise<void>((resolve) => {
        socket.write(data, () => {
          resolve();
        });
      }),
    onEof: () => {
      socket.end();
    },
    onClose: () => {
      socket.destroy();
    },
  });
  const waitAndResume = async (): Promise<void> => {
    await relay.waitForRoom();
    socket.resume();
  };
  socket.on('data', (chunk: Buffer) => {
    if (!relay.send(chunk)) {
      socket.pause();
      void waitAndResume();
    }
  });
  socket.on('end', () => {
    relay.sendEof();
  });
  socket.on('error', (error) => {
    printStep('relay-error', { message: error.message });
  });
  socket.on('close', () => {
    relay.close();
  });
}

async function runGuestChecks(): Promise<void> {
  const base = `http://127.0.0.1:${guestPort}`,
    impdHost = new URL(impURL).host,
    impdAddress = (await lookup(impdHost, { family: 4 })).address,
    call = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'add', arguments: { a: 40, b: 2 } },
    });
  const env = {
    TOOL_TOKEN: toolToken,
    BASE: base,
    CALL: call,
    IMPD_HOST: impdHost,
    IMPD_ADDRESS: impdAddress,
  };
  redactions.push([impdHost, '<impd-host>'], [impdAddress, '<impd-address>']);

  printStep('guest-tool-call', await runGuest(
    'curl -sS -m 10 --noproxy "*" -H "Authorization: Bearer $TOOL_TOKEN" -H "content-type: application/json" -d "$CALL" -w "\\nstatus=%{http_code} total=%{time_total}s" "$BASE/mcp"',
    env,
  ));
  printStep('guest-tool-call-no-token', await runGuest(
    'curl -sS -m 10 --noproxy "*" -o /dev/null -w "status=%{http_code}" -d "$CALL" "$BASE/mcp"',
    env,
  ));
  printStep('guest-stream', await runGuest(
    'curl -sSN -m 10 --noproxy "*" -H "Authorization: Bearer $TOOL_TOKEN" "$BASE/stream" | while IFS= read -r line; do echo "$(date +%s.%N) $line"; done',
    env,
  ));
  quiet.isOn = true;
  printStep('guest-latency', await runGuest(
    'for i in $(seq 1 60); do curl -sS -m 10 --noproxy "*" -o /dev/null -H "Authorization: Bearer $TOOL_TOKEN" -H "content-type: application/json" -d "$CALL" -w "%{time_total}\\n" "$BASE/mcp"; done | tail -n 50 | sort -n | awk \'{v[NR]=$1} END {printf "n=%d median=%.4fs p95=%.4fs\\n", NR, (v[int(NR/2)]+v[int(NR/2)+1])/2, v[int(NR*0.95)]}\'',
    env,
  ));
  quiet.isOn = false;
  printStep('guest-egress-impd-name', await runGuest(
    'curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" "https://$IMPD_HOST/health"; echo " exit=$?"',
    env,
  ));
  printStep('guest-egress-impd-address', await runGuest(
    'curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" --resolve "$IMPD_HOST:443:$IMPD_ADDRESS" "https://$IMPD_HOST/health"; echo " exit=$?"',
    env,
  ));
  printStep('guest-egress-gateway', await runGuest(
    'gw=$(ip -4 route show default | awk \'{print $3; exit}\'); curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" "http://$gw:7070/health"; echo " exit=$?"',
    env,
  ));
  printStep('guest-egress-internet', await runGuest(
    'curl -sS -m 5 --noproxy "*" -o /dev/null -w "status=%{http_code}" https://1.1.1.1/; echo " exit=$?"',
    env,
  ));
}

async function runGuest(
  script: string,
  env: Readonly<Record<string, string>>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const result = await client.run(impName, ['bash', '-c', script], { env });
  const decoder = new TextDecoder();
  return {
    code: result.code,
    stdout: decoder.decode(result.stdout).trim(),
    stderr: decoder.decode(result.stderr).trim(),
  };
}

// every TCP socket in LISTEN and every bound UDP socket in the pod's network
// namespace, from /proc
function collectListeners(): string[] {
  const rows: string[] = [];
  for (const table of ['tcp', 'tcp6', 'udp', 'udp6']) {
    const lines = readFileSync(`/proc/net/${table}`, 'utf8').trim().split('\n').slice(1);
    for (const line of lines) {
      const [, local, , state] = line.trim().split(/\s+/u);
      const isListening = table.startsWith('tcp') ? state === '0A' : state === '07';
      if (isListening && local) {
        rows.push(`${table} ${local}`);
      }
    }
  }
  return rows;
}

function printStep(step: string, data: unknown): void {
  const ms = Math.round(performance.now() - startedAt);
  let line = JSON.stringify({ step, ms, data });
  for (const [value, mark] of redactions) {
    line = line.replaceAll(value, mark);
  }
  console.log(line);
}
