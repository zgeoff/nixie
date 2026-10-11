// Where the live checks find a deployed nixie: its URL, and kubectl with a kubeconfig and the
// namespace nixie runs in. A suite skips when a value it needs is null.
export interface LiveEnv {
  readonly url: string | null;
  readonly kubectl: KubectlTarget | null;

  // the nixie image, pinned by digest, that the rollout check rolls the StatefulSet to
  readonly rollImage: string | null;

  // an impd token with manage scope on nixie's sandboxes, for the fetch sandbox check
  readonly impdToken: string | null;

  // a tailnet address with a listener on port 80, which the fetch sandbox must not reach
  readonly tailnetAddress: string;
}

export interface KubectlTarget {
  // the command that runs kubectl, NIXIE_LIVE_KUBECTL or kubectl from the path
  readonly argv: readonly string[];
  readonly kubeconfig: string;
  readonly namespace: string;
}

type Env = Readonly<Record<string, string | undefined>>;

// Parses the live checks' variables, which docs/runbooks/live-checks.md names. A variable that is
// unset or empty leaves its value null; one that is set but malformed throws, so a typo never
// passes as a skipped suite.
export function parseLiveEnv(env: Env): LiveEnv {
  const kubeconfig = findValue(env, 'NIXIE_LIVE_KUBECONFIG');

  return {
    url: parseURL(findValue(env, 'NIXIE_LIVE_URL')),
    kubectl:
      kubeconfig === null
        ? null
        : {
            argv: [findValue(env, 'NIXIE_LIVE_KUBECTL') ?? 'kubectl'],
            kubeconfig,
            namespace: findValue(env, 'NIXIE_LIVE_NAMESPACE') ?? 'nixie',
          },
    rollImage: parseRollImage(findValue(env, 'NIXIE_LIVE_ROLL_IMAGE')),
    impdToken: findValue(env, 'NIXIE_LIVE_IMPD_TOKEN'),
    tailnetAddress: findValue(env, 'NIXIE_LIVE_TAILNET_ADDRESS') ?? '100.100.100.100',
  };
}

function findValue(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? '';

  return value === '' ? null : value;
}

// the origin the ingress serves nixie on, with no path, so /rpc resolves against it
function parseURL(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (!URL.canParse(value) || !['http:', 'https:'].includes(new URL(value).protocol)) {
    throw new Error(`NIXIE_LIVE_URL must be an http or https URL, not ${value}`);
  }
  return new URL(value).origin;
}

function parseRollImage(value: string | null): string | null {
  if (value !== null && !/^[^\s@]+@sha256:[\da-f]{64}$/u.test(value)) {
    throw new Error(`NIXIE_LIVE_ROLL_IMAGE must name an image by its digest, not ${value}`);
  }
  return value;
}
