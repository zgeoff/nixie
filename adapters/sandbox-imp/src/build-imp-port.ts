import type { ImpClient } from '@zgeoff/imp-client';
import { ORPCError, createImpClient, openReverseForward } from '@zgeoff/imp-client';
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
  'readFeatures' | 'createImp' | 'removeImp' | 'sleepImp' | 'wakeImp'
>;

function buildLifecycleCalls(client: ImpClient): LifecycleCalls {
  return {
    readFeatures: () => readFeatures(client),
    createImp: async (input) => {
      await client.imps.create({
        ...input,
        policy: { mode: input.policy.mode, allow: [...input.policy.allow] },
      });
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
      await client.requireAwake(name);
    },
  };
}

async function readFeatures(client: ImpClient): ReturnType<ImpPort['readFeatures']> {
  const [check, info] = await Promise.all([client.checkServer(), client.system.info()]);

  if (!check.compatible) {
    throw new Error(`impd ${check.serverVersion} does not speak imp client ${check.clientVersion}`);
  }
  return {
    publicEgress: info.features?.publicEgress === true,
    isEgressEnforced: info.egress?.isEnforced === true,
  };
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
