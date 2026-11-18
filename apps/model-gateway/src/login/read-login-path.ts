import { loadProxyConfig } from '../proxy/load-proxy-config';
import { pickLoginRoute } from './pick-login-route';

// The login file of a route, for a command that names the config and the route.
export async function readLoginPath(configPath: string, routeID: string): Promise<string> {
  const config = await loadProxyConfig(configPath);

  const pick = pickLoginRoute(config.routes, routeID);

  if (pick.kind === 'refused') {
    throw new Error(pick.message);
  }

  return pick.login.file;
}
