// Option B, guest side: runs inside the imp and reaches nixie's tools on the host over HTTP.
// Usage: bun --env-file=guest.env guest.ts [--probe] [--keep-proxy] [--nonessential]
// Env: NIXIE_MCP_URL, NIXIE_MCP_TOKEN, NIXIE_CONNECT_LOG (connect-log.ts's URL), and the broker's.
import { runSession } from './session.ts';

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

// The broker's variables pass through by name, because options.env replaces the CLI's whole env.
const brokerVariables = [
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'NODE_USE_ENV_PROXY',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ],
  connectLog = process.env.NIXIE_CONNECT_LOG,
  env: Record<string, string> = {
    // The broker drops the guest's Authorization header and sets the real token.
    CLAUDE_CODE_OAUTH_TOKEN: 'imp-broker-placeholder',
    HOME: readEnv('HOME'),
    PATH: readEnv('PATH'),
  };
for (const name of brokerVariables) {
  if (process.env[name]) {
    env[name] = readEnv(name);
  }
}

if (!process.argv.includes('--nonessential')) {
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
}

if (connectLog) {
  env.HTTPS_PROXY = connectLog;
  env.https_proxy = connectLog;
}

// Claude Code sends a plain http:// MCP request through HTTPS_PROXY, and the broker serves only
// CONNECT, so the tool endpoint's host goes on NO_PROXY.
if (!process.argv.includes('--keep-proxy')) {
  const mcpHost = new URL(readEnv('NIXIE_MCP_URL')).hostname;
  env.NO_PROXY = [readEnv('NO_PROXY'), mcpHost].filter(Boolean).join(',');
  env.no_proxy = env.NO_PROXY;
}

await runSession(
  {
    alwaysLoad: true,
    headers: { Authorization: `Bearer ${readEnv('NIXIE_MCP_TOKEN')}` },
    type: 'http',
    url: readEnv('NIXIE_MCP_URL'),
  },
  env,
  '/tmp/claude-debug.log',
);
