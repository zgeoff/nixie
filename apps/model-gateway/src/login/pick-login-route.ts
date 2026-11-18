import type { PlanLoginConfig, ProxyRoute } from '../types';

export type LoginRoutePick =
  | { readonly kind: 'found'; readonly login: PlanLoginConfig }
  | { readonly kind: 'refused'; readonly message: string };

export function pickLoginRoute(
  routes: Readonly<Record<string, ProxyRoute>>,
  routeID: string,
): LoginRoutePick {
  const route = Object.hasOwn(routes, routeID) ? routes[routeID] : undefined;

  if (route === undefined) {
    return { kind: 'refused', message: `the config has no route ${routeID}` };
  }

  return route.login === null
    ? {
        kind: 'refused',
        message: `the route ${routeID} has no login block, so it holds no plan login`,
      }
    : { kind: 'found', login: route.login };
}
