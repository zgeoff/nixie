import type { Endpoints } from '@wringer/core';

type Env = Readonly<Record<string, string | undefined>>;

// The web origin, from the environment, so no deployment's host name lives in the repo. The deploy
// job runs the doctor alone and reaches no web origin, so it leaves NIXIE_PROD_URL unset.
export function buildProdEndpoints(env: Env): Endpoints {
  const url = env['NIXIE_PROD_URL'];

  return url === undefined || url === '' ? {} : { web: new URL(url).origin };
}
