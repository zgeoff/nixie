import type { SandboxSpec, ToolTargetResolver } from '@heynixie/sandbox';
import { startToolRelay } from './start-tool-relay';
import type { ImpForward, ImpPort } from './types';

export interface RouteRegistry {
  readonly open: (id: string, spec: SandboxSpec) => Promise<void>;
  readonly close: (id: string) => Promise<void>;
}

export interface RouteOptions {
  readonly port: ImpPort;
  readonly toolTarget: ToolTargetResolver;
  readonly guestToolPort: number;
}

export function buildRouteRegistry(options: RouteOptions): RouteRegistry {
  const forwards = new Map<string, Promise<ImpForward>>();

  const removeWhenEnded = async (id: string, opening: Promise<ImpForward>): Promise<void> => {
    await waitForForwardEnd(opening);

    if (forwards.get(id) === opening) {
      forwards.delete(id);
    }
  };

  const startForward = (id: string, spec: SandboxSpec): Promise<ImpForward> => {
    const opening = startReverseForward(options, id, spec);

    forwards.set(id, opening);
    void removeWhenEnded(id, opening);

    return opening;
  };

  return {
    open: async (id, spec) => {
      if (spec.toolRoute) {
        await (forwards.get(id) ?? startForward(id, spec));
      }
    },
    close: async (id) => {
      const opening = forwards.get(id);

      forwards.delete(id);

      await stopForward(opening);
    },
  };
}

async function waitForForwardEnd(opening: Promise<ImpForward>): Promise<void> {
  try {
    const forward = await opening;

    await forward.ended;
  } catch {}
}

async function startReverseForward(
  options: RouteOptions,
  id: string,
  spec: SandboxSpec,
): Promise<ImpForward> {
  const forward = options.port.openReverseForward(id, options.guestToolPort, (accept) => {
    startToolRelay(options.toolTarget({ id, owner: spec.owner }), accept);
  });

  try {
    await forward.listening;

    return forward;
  } catch (error) {
    forward.stop();
    throw error;
  }
}

async function stopForward(opening: Promise<ImpForward> | undefined): Promise<void> {
  try {
    const forward = await opening;

    forward?.stop();
  } catch {}
}
