import type { SandboxSpec, ToolTargetResolver } from '@heynixie/sandbox';
import { startToolRelay } from './start-tool-relay';
import type { ImpForward, ImpPort } from './types';

// The reverse forwards the adapter holds open, one per sandbox with a tool route.
export interface RouteRegistry {
  // opens the forward unless one is open: after a create, a wake, or a sleep impd took on its own
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

  // a forward that ends on its own, as when impd puts the imp to sleep, leaves the registry, so
  // the next open listens again
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

// The first listen wakes a sleeping imp.
async function startReverseForward(
  options: RouteOptions,
  id: string,
  spec: SandboxSpec,
): Promise<ImpForward> {
  // each connection resolves its target afresh, so a long-lived forward follows the owner's run
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

// a forward that never opened counts as ended
async function waitForForwardEnd(opening: Promise<ImpForward>): Promise<void> {
  try {
    const forward = await opening;

    await forward.ended;
  } catch {
    // the open failed, and its caller saw why
  }
}

async function stopForward(opening: Promise<ImpForward> | undefined): Promise<void> {
  try {
    const forward = await opening;

    forward?.stop();
  } catch {
    // a forward that never opened has nothing to stop
  }
}
