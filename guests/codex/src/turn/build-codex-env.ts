import { credentialVariable, toolTokenVariable } from '../config/build-codex-config';
import { getCodexHome } from './get-codex-home';

const passedVariables = [
  'PATH',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'SSL_CERT_FILE',
] as const;

// The environment of the CLI. The guest holds only a placeholder credential, and the sandbox's
// grant replaces the auth header on the way out.
export function buildCodexEnv(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  toolToken: string,
): Record<string, string> {
  const placeholder = env[credentialVariable];

  if (placeholder === undefined || placeholder === '') {
    throw new Error(`the codex guest has no placeholder credential in ${credentialVariable}`);
  }

  const passed = Object.fromEntries(
    passedVariables.flatMap((name) => {
      const value = env[name];

      return value === undefined ? [] : [[name, value]];
    }),
  );

  return {
    ...passed,
    HOME: home,
    CODEX_HOME: getCodexHome(home),
    [credentialVariable]: placeholder,
    [toolTokenVariable]: toolToken,
  };
}
