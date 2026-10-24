import { SandboxHostError } from '@heynixie/sandbox';
import type { ImpClient } from '@impz/client';
import { ORPCError, createImpClient, openReverseForward } from '@impz/client';
import type { ImpPort } from './types';

export interface ImpConnection {
  readonly url: string;

  readonly token: string;
}

export function buildImpPort(connection: ImpConnection): ImpPort {
  const client = createImpClient({ url: connection.url, token: connection.token });

  return {
    ...buildLifecycleCalls(client),
    readSecretHosts: async (secret) => {
      const secrets = await client.secrets.list();

      const found = secrets.find((row) => row.name === secret);

      return found ? found.rules.map((rule) => rule.host) : null;
    },
    addGrant: async (name, secret) => {
      await client.grants.add({ name, secret });
    },
    addSecret: async (secret) => {
      await client.secrets.add({
        name: secret.name,
        kind: 'custom',
        value: secret.value,
        rules: [{ host: secret.host, header: secret.header, scheme: secret.scheme }],
      });
    },
    listImages: async () => {
      const images = await client.images.list();

      return images.map((image) => ({ name: image.name, digest: image.digest, ref: image.ref }));
    },
    addImage: async (image) => {
      await client.images.add({ ref: image.ref, name: image.name });
    },
    openExec: makeExecOpener(client),
    openReverseForward: (name, guestPort, onConnection) =>
      openReverseForward({
        baseUrl: connection.url,
        token: connection.token,
        name,
        guest: { network: 'tcp', port: guestPort },
        connect: (url, headers) => new WebSocket(url, { headers: { ...headers } }),
        onConnection,
      }),
  };
}

type LifecycleCalls = Pick<
  ImpPort,
  'readFeatures' | 'createImp' | 'readImpBackup' | 'removeImp' | 'sleepImp' | 'wakeImp'
>;

function buildLifecycleCalls(client: ImpClient): LifecycleCalls {
  return {
    readFeatures: (signal) => readFeatures(client, signal),
    createImp: async (input) => {
      await withHostError('create', () =>
        client.imps.create({
          ...input,
          policy: { mode: input.policy.mode, allow: [...input.policy.allow] },
        }),
      );
    },
    readImpBackup: async (name) => {
      try {
        const imp = await client.imps.get({ name });

        // impd leaves the flag out for an imp that it backs up.
        return imp.backup !== false;
      } catch (error) {
        requireNotFound(error);

        return null;
      }
    },
    removeImp: async (name) => {
      try {
        await client.imps.destroy({ name });
      } catch (error) {
        requireNotFound(error);
      }
    },
    sleepImp: async (name) => {
      await client.imps.sleep({ name });
    },
    wakeImp: async (name) => {
      await withHostError('wake', () => client.requireAwake(name));
    },
  };
}

async function readFeatures(
  client: ImpClient,
  signal: AbortSignal | undefined,
): ReturnType<ImpPort['readFeatures']> {
  const options = signal === undefined ? {} : { signal };

  const check = await client.checkServer(options);

  if (!check.compatible && !isExtraImpdMajor(check.serverVersion)) {
    throw new Error(`impd ${check.serverVersion} does not speak imp client ${check.clientVersion}`);
  }

  return {
    publicEgress: check.info.features?.publicEgress === true,
    isEgressEnforced: check.info.egress?.isEnforced === true,
    hasBackupOptOut: check.info.features?.backupOptOut === true,
  };
}

// imp client 4 differs from imp client 3 only in how it builds an image, and nixie adds images by
// ref, never through a build, so imp client 4 speaks impd 3 too. impd 3 drops only the
// IMP_BUILD_ISOLATION setting, which nixie never sets, so it speaks impd 2 as well.
const EXTRA_IMPD_MAJORS: ReadonlySet<number> = new Set([2, 3]);

function isExtraImpdMajor(version: string): boolean {
  const major = /^(?<major>\d+)\.\d+\.\d+/u.exec(version)?.groups?.['major'];

  return major !== undefined && EXTRA_IMPD_MAJORS.has(Number(major));
}

// impd's refusal, such as RAM_BUDGET_EXCEEDED, arrives as an ORPCError whose name is plain Error,
// so a log line would not say which call failed or why. The error is rethrown with the call named.
async function withHostError(call: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ORPCError) {
      throw new SandboxHostError(
        { call, code: String(error.code), hostMessage: error.message },
        { cause: error },
      );
    }

    throw error;
  }
}

function requireNotFound(error: unknown): void {
  if (!(error instanceof ORPCError && error.code === 'NOT_FOUND')) {
    throw error;
  }
}

function makeExecOpener(client: ImpClient): ImpPort['openExec'] {
  return async (name, argv, options) => {
    const handle = await client.openExec(name, argv, {
      env: options.env,
      killGraceMs: options.killGraceMs,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.requireBroker ? { require: ['broker'] as const } : {}),
    });

    return {
      started: handle.started,
      stdout: handle.stdout,
      stderr: handle.stderr,
      write: handle.write,
      closeStdin: handle.closeStdin,
      sendSignal: handle.sendSignal,
      close: handle.close,
      exit: handle.exit,
    };
  };
}
