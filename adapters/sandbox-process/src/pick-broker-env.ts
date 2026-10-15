// the variables that route a process through the host's credential broker: its proxy, its bypass
// list and the certificate that its proxy signs with
const brokerVariables = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
] as const;

// Picks the broker's variables that are set in the host's environment. A host with a credential
// broker, such as an imp, injects a credential into each request that its proxy carries, so a guest
// that holds only a placeholder reaches its API through them.
export function pickBrokerEnv(
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    brokerVariables.flatMap((name) => {
      const value = env[name];

      return value === undefined || value === '' ? [] : [[name, value]];
    }),
  );
}
