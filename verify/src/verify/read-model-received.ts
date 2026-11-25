import type { HttpClient } from '@wringer/http';
import { controlRoutes } from './harness/control-routes';
import { pickModelRefusal } from './pick-model-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

interface HarnessContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// Reads how many requests of the scripted model held the text, and fails with `check-failed` when
// none did.
export async function readModelReceived(ctx: HarnessContext, text: string) {
  refuseHarnessless(ctx.target, 'model received');

  const counted = await postControl(ctx.drivers.http, controlRoutes.modelReceived, { text });

  throwRefusal(pickModelRefusal(counted.requests, text), counted);

  return counted;
}
