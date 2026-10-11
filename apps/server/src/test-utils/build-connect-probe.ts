import type { RunSpec } from '@heynixie/sandbox';

// a direct TCP connection, which prints connected or failed with the reason
const probeScript = [
  "const timer = setTimeout(() => { console.log('failed timeout'); process.exit(0); }, 5000);",
  'try {',
  '  const socket = await Bun.connect({',
  '    hostname: process.env.PROBE_HOST,',
  '    port: Number(process.env.PROBE_PORT),',
  '    socket: { data() {} },',
  '  });',
  "  console.log('connected');",
  '  socket.end();',
  '} catch (error) {',
  "  console.log('failed ' + (error.code ?? error.message));",
  '}',
  'clearTimeout(timer);',
  'process.exit(0);',
].join('\n');

// Builds a command that opens one TCP connection with Bun, past any fetcher check, so the network
// layer alone decides whether it connects. It prints connected, or failed with the reason.
export function buildConnectProbe(bun: string, host: string, port: number): RunSpec {
  return { argv: [bun, '-e', probeScript], env: { PROBE_HOST: host, PROBE_PORT: String(port) } };
}
