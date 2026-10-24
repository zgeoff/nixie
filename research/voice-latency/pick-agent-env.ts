// The credential and the network settings the Agent SDK's CLI needs, and nothing else from the
// shell, so a variable that changes the CLI's behaviour never leaks into a timed turn.
const agentEnvKeys = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'HOME',
  'HTTPS_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_ENV_PROXY',
  'NO_PROXY',
  'PATH',
  'SSL_CERT_FILE',
  'https_proxy',
  'no_proxy',
];

export function pickAgentEnv(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    agentEnvKeys.flatMap((key) => {
      const value = source[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}
