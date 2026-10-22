import type { APISettings } from './types';

export const defaultAPISettings: APISettings = {
  enrolmentCodeLifetimeMs: 15 * 60 * 1000,
  sessionIdleMs: 30 * 24 * 60 * 60 * 1000,
  refusalIntervalMs: 60 * 60 * 1000,
  lastSeenIntervalMs: 60 * 1000,
  isMemoryWriterEnabled: true,
  isMemoryConsolidatorEnabled: true,
};
