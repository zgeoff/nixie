import type { PlanLogins } from '@heynixie/spend';

export type PlanLoginPick =
  | { readonly kind: 'found'; readonly accountID: string; readonly planType: string }
  | { readonly kind: 'failed'; readonly problem: string };

// The route's login from the gateway's held answer, or the problem with it. The route ID is the
// plan profile's ID.
export function pickPlanLogin(logins: PlanLogins, routeID: string): PlanLoginPick {
  if (logins.state === 'unreachable') {
    return { kind: 'failed', problem: 'the model gateway did not answer for its logins' };
  }

  const login = Object.hasOwn(logins.routes, routeID) ? logins.routes[routeID] : undefined;

  if (login === undefined) {
    return { kind: 'failed', problem: `the model gateway has no plan route ${routeID}` };
  }

  if (login.status !== 'active') {
    return { kind: 'failed', problem: `its login is ${login.status}` };
  }

  if (login.accountID === null || login.planType === null) {
    return { kind: 'failed', problem: 'its login names no account or plan' };
  }

  return { kind: 'found', accountID: login.accountID, planType: login.planType };
}
