import type { ProxyConfig } from '../types';
import { proxyConfigSchema } from './proxy-config-schema';

export async function loadProxyConfig(configPath: string): Promise<ProxyConfig> {
  const text = await Bun.file(configPath).text();

  return proxyConfigSchema.parse(Bun.YAML.parse(text));
}
