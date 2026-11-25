import type { HttpClient } from '@wringer/http';
import { controlRoutes } from './harness/control-routes';
import { pickLiveOpensRefusal } from './pick-live-opens-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

interface LiveOpensContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// Reads how many live streams the browser opened, and fails with `check-failed` when an expected
// count differs.
export async function readLiveOpens(
  ctx: LiveOpensContext,
  expected: number | undefined,
): Promise<{ opened: number }> {
  refuseHarnessless(ctx.target, 'live opens');

  const counted = await postControl(ctx.drivers.http, controlRoutes.liveOpens, {});

  throwRefusal(pickLiveOpensRefusal(counted.opened, expected), counted);

  return counted;
}
