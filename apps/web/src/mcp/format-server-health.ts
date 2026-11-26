import type { McpServer } from './types';

export function formatServerHealth(server: McpServer): string {
  if (server.health === 'healthy') {
    return 'Healthy';
  }

  const next =
    server.nextTryAtMs === null
      ? ''
      : `, next try ${new Date(server.nextTryAtMs).toISOString().slice(11, 16)} UTC`;

  return `Unreachable (${server.lastError ?? 'error'})${next}`;
}
