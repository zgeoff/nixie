import { createHash } from 'node:crypto';
import type { Clock } from '@heynixie/clock';
import { makeFetchBackoff } from '@heynixie/connectors';
import { makeAddressCheck } from '@heynixie/egress';
import type { DeviceFetching } from '../tool/device-tool-options';

// a package of the fake registry: the files it holds, and what its document says
export interface TestPackage {
  readonly files: Readonly<Record<string, string>>;
  readonly publisher?: string;
  readonly description?: string;
}

export interface TestFetchingOptions {
  readonly clock: Clock;
  readonly registry?: string;

  // the hosts that the decision point allows; every other host is asked about and answers no
  readonly allowedHosts: readonly string[];

  // texts that the scan of a URL finds as secrets
  readonly secrets?: readonly string[];
}

export const testRegistry = 'https://registry.test';

// The sha512 integrity of a package's files, as the fake registry's document states it.
export function toTestIntegrity(files: Readonly<Record<string, string>>): string {
  const hash = createHash('sha512');

  for (const [path, text] of Object.entries(files).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(`${path}\0${text}\0`);
  }

  return `sha512-${hash.digest('base64')}`;
}

// A fetch sandbox that answers from memory: a registry of packages, pages of text by URL and
// redirects by URL. It records each URL it was asked for, so a test shows that a refused fetch
// never ran. A redirect goes through the caller's hop scan as the real sandbox's does.
export function buildTestFetching(options: TestFetchingOptions) {
  const registry = options.registry ?? testRegistry;

  const packages = new Map<string, TestPackage>();
  const pages = new Map<string, { status: number; text: string; type: string }>();
  const redirects = new Map<string, string>();
  const allowed = new Set(options.allowedHosts);

  const requests: string[] = [];

  const whenRequested = new Map<string, () => Promise<void>>();

  const backoff = makeFetchBackoff({
    backoffMs: 30_000,
    backoffCapMs: 300_000,
    clock: options.clock,
  });

  const fetching: DeviceFetching = {
    registry,
    backoff,
    checkAddress: makeAddressCheck(['10.0.0.0/8', '127.0.0.0/8', '192.168.0.0/16']),
    scanURL: (url) =>
      (options.secrets ?? []).some((secret) => url.includes(secret))
        ? 'the URL holds a secret (rule test), so it was not fetched'
        : null,
    checkHosts: (_callSequence, hosts) => Promise.resolve(hosts.every((host) => allowed.has(host))),
    readBody: async (url, readOptions) => {
      requests.push(url);

      await whenRequested.get(url)?.();

      const target = redirects.get(url);

      if (target !== undefined) {
        const verdict = await readOptions?.scanHop?.({
          number: 1,
          url: target,
          sentBy: new URL(url).host,
        });

        if (verdict?.kind === 'refuse') {
          return { kind: 'refused', reason: verdict.reason, isGated: true };
        }
      }

      const document = readRegistryDocument(registry, packages, url);

      if (document !== null) {
        return body(url, 200, JSON.stringify(document), 'application/json');
      }

      if (url.startsWith(`${registry}/`)) {
        return body(url, 404, '{}', 'application/json');
      }

      const page = pages.get(url);

      return page === undefined
        ? { kind: 'failed', reason: 'no such page', isGated: true }
        : body(url, page.status, page.text, page.type);
    },
    readPackage: (url, request) => {
      requests.push(url);

      const found = [...packages].find(([key]) => url === buildTestTarballURL(registry, key))?.[1];

      if (found === undefined) {
        return Promise.resolve({ kind: 'failed', reason: 'no such tarball', isGated: true });
      }

      if (toTestIntegrity(found.files) !== request.integrity) {
        return Promise.resolve({
          kind: 'refused',
          reason: 'the tarball does not match the integrity that was approved',
          isGated: true,
        });
      }

      return Promise.resolve({
        kind: 'package',
        url,
        files: Object.entries(found.files).map(([path, text]) => ({
          path,
          base64: Buffer.from(text).toString('base64'),
        })),
        isGated: true,
      });
    },
  };

  return {
    fetching,

    // every URL that the sandbox was asked to read, in order
    requests,
    addPackage: (spec: string, item: TestPackage) => {
      packages.set(spec, item);
    },
    addPage: (url: string, text: string, status = 200, type = 'application/json') => {
      pages.set(url, { status, text, type });
    },
    addRedirect: (url: string, target: string) => {
      redirects.set(url, target);
    },

    // runs the hold while the sandbox keeps the request of the URL, before it answers
    holdRequest: (url: string, hold: () => Promise<void>) => {
      whenRequested.set(url, hold);
    },
    allowHost: (host: string) => {
      allowed.add(host);
    },
    forbidHost: (host: string) => {
      allowed.delete(host);
    },
  };
}

function readRegistryDocument(
  registry: string,
  packages: ReadonlyMap<string, TestPackage>,
  url: string,
): object | null {
  for (const [spec, item] of packages) {
    const at = spec.lastIndexOf('@');
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);

    if (url === `${registry}/${name.replace('/', '%2F')}/${version}`) {
      return {
        name,
        version,
        description: item.description ?? '',
        _npmUser: { name: item.publisher ?? 'a-publisher' },
        dist: {
          integrity: toTestIntegrity(item.files),
          unpackedSize: Object.values(item.files).join('').length,
        },
      };
    }
  }

  return null;
}

function body(url: string, status: number, text: string, contentType: string) {
  return {
    kind: 'body' as const,
    url,
    status,
    contentType,
    text,
    isTruncated: false,
    retryAfterMs: null,
    isGated: true,
  };
}

function buildTestTarballURL(registry: string, spec: string): string {
  const at = spec.lastIndexOf('@');
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);

  return `${registry}/${name}/-/${name.split('/').pop() ?? name}-${version}.tgz`;
}
