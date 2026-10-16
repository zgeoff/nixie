// oxlint-disable one-var, sort-vars, no-await-in-loop, promise/avoid-new -- sequential measurements, grouped spike setup
import { mkdtempSync } from 'node:fs';
import { createConnection } from 'node:net';
import { query } from '@anthropic-ai/claude-agent-sdk';

const url = process.env.SPIKE_TOOLS_URL ?? '',
  mode = process.argv[2] ?? 'bench',
  started = performance.now();
function emit(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ms: performance.now() - started, ...fields }));
}
if (mode === 'bench') {
  const samples: number[] = [];
  for (let index = 0; index < 110; index += 1) {
    const start = performance.now(),
      response = await fetch(`${url}/bench`);
    if (!((await response.json()) as { ok?: boolean }).ok) {
      throw new Error('bad response');
    }
    if (index >= 10) {
      samples.push(performance.now() - start);
    }
  }
  samples.sort((a, b) => a - b);
  emit('bench', { samples: samples.length, p50: samples[49], p95: samples[94], p99: samples[98] });
  const streamStart = performance.now(),
    response = await fetch(`${url}/stream`),
    reader = response.body?.getReader();
  if (!reader) {
    throw new Error('missing stream body');
  }
  let firstMs = 0,
    text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    if (!text) {
      firstMs = performance.now() - streamStart;
    }
    text += new TextDecoder().decode(chunk.value);
  }
  if (text !== 'first\nlast\n' || firstMs > 150) {
    throw new Error(`buffered stream: ${firstMs}`);
  }
  emit('stream', { firstMs, endMs: performance.now() - streamStart });
} else if (mode === 'isolation' || mode === 'control') {
  const candidates = [
    ['management-gateway', '10.66.0.1', 7070],
    [
      'management-host',
      process.env.SPIKE_BRIDGE ?? '172.17.0.1',
      Number(process.env.SPIKE_API_PORT ?? '7970'),
    ],
    ['external', '1.1.1.1', 80],
  ] as const;
  const targets =
    mode === 'control' ? candidates.filter(([kind]) => kind === 'management-host') : candidates;
  for (const [targetKind, hostname, port] of targets) {
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: hostname, port });
      const resolveSocket = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(1500);
      socket.once('connect', () => resolveSocket(true));
      socket.once('timeout', () => resolveSocket(false));
      socket.once('error', () => resolveSocket(false));
    });
    if (reachable !== (mode === 'control')) {
      throw new Error(`unexpected network reachability: ${targetKind} ${reachable}`);
    }
    const event = reachable ? 'reachable' : 'unreachable';
    emit(event, { targetKind });
  }
} else {
  const home = mkdtempSync('/tmp/nixie-route-home-'),
    env: Record<string, string> = {
      HOME: home,
      CLAUDE_CONFIG_DIR: `${home}/.claude`,
      PATH: process.env.PATH ?? '',
      ANTHROPIC_API_KEY: 'broker-placeholder',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      NO_PROXY: process.env.NO_PROXY ?? '127.0.0.1,localhost',
      no_proxy: process.env.NO_PROXY ?? '127.0.0.1,localhost',
    };
  for (const name of [
    'HTTPS_PROXY',
    'https_proxy',
    'NODE_USE_ENV_PROXY',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ]) {
    const value = process.env[name];
    if (value) {
      env[name] = value;
    }
  }
  let connected = false,
    tool = false,
    succeeded = false;
  for await (const message of query({
    prompt: 'Call ping once, then stop.',
    options: {
      env,
      cwd: home,
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      allowedTools: ['mcp__nixie__ping'],
      model: 'claude-haiku-4-5',
      maxTurns: 3,
      mcpServers: {
        nixie: {
          type: 'http',
          url: `${url}/mcp`,
          headers: { Authorization: `Bearer ${process.env.SPIKE_MCP_TOKEN}` },
          alwaysLoad: true,
        },
      },
    },
  })) {
    if (message.type === 'system' && message.subtype === 'init') {
      connected = message.mcp_servers.some(
        (server) => server.name === 'nixie' && server.status === 'connected',
      );
      emit('init', { connected });
      if (!connected) {
        throw new Error('MCP not connected');
      }
    }
    if (message.type === 'user' && 'tool_use_result' in message) {
      tool = JSON.stringify(message.tool_use_result).includes('42');
      emit('tool-result', { matches: tool });
    }
    if (message.type === 'result') {
      succeeded = message.subtype === 'success' && !message.is_error;
      emit('result', { succeeded });
    }
  }
  if (!connected || !tool || !succeeded) {
    throw new Error('SDK tool round trip failed');
  }
}
