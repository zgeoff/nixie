// The statuses a health answer reports: degraded only on readiness, while a dependency part fails.
export const healthStatuses = ['ready', 'degraded', 'unready'] as const;

export type HealthStatus = (typeof healthStatuses)[number];
