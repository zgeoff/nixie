import { SandboxHostError } from '@heynixie/sandbox';
import type { ImpClient } from '@zgeoff/imp-client';
import { CLIENT_VERSION, ORPCError, createImpClient, openReverseForward } from '@zgeoff/imp-client';
import type { ImpPort } from './types';

export interface ImpConnection {
  // impd's API, such as http://localhost:7070
  readonly url: string;

  // a token with manage scope on nixie's imps
  readonly token: string;
}

// Builds the port on imp's client, the only place nixie imports it.
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

        // impd leaves the flag out for an imp it backs up
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

// One system.info call, which the signal ends, such as on a half-open connection. The client's
// checkServer makes the same call with no signal, so the version check runs here on its answer.
async function readFeatures(
  client: ImpClient,
  signal: AbortSignal | undefined,
): ReturnType<ImpPort['readFeatures']> {
  const options = signal === undefined ? {} : { signal };

  const info = await client.system.info(undefined, options);

  if (!isSpokenImpd(info.version) && !isRenamedImpd(info.version)) {
    throw new Error(`impd ${info.version} does not speak imp client ${CLIENT_VERSION}`);
  }

  return {
    publicEgress: info.features?.publicEgress === true,
    isEgressEnforced: info.egress?.isEnforced === true,
    hasBackupOptOut: info.features?.backupOptOut === true,
  };
}

// the client's own checkServer rule for a client past 1.0.0: impd speaks it when they share a major
function isSpokenImpd(serverVersion: string): boolean {
  const major = findMajor(serverVersion);

  return major !== null && major === findMajor(CLIENT_VERSION);
}

const MAJOR = /^(?<major>\d+)\.\d+\.\d+/u;

function findMajor(version: string): string | null {
  return MAJOR.exec(version)?.groups?.['major'] ?? null;
}

// impd 2 renamed imp to impz and kept the wire API of impd 1.6, which this 1.x client speaks; the
// client's own check refuses any other major, so nixie accepts major 2 until it takes a 2.x client
const RENAMED_IMPD = /^2\.\d+\.\d+/u;

function isRenamedImpd(serverVersion: string): boolean {
  return RENAMED_IMPD.test(serverVersion);
}

// impd's error for a call it refuses, such as RAM_BUDGET_EXCEEDED when its memory budget is full,
// carries its code and its own text, but its name is plain Error, so the call rethrows it as a
// SandboxHostError that names the call, and a failed turn's step error and log line say why
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

// an imp that is gone already counts as removed, so a retried destroy succeeds
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
