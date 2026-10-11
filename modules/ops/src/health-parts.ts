// The parts that readiness lists in slice 1. A part joins in the slice that builds it, because a
// part with nothing built would hold readiness down or report a check that never ran: spending
// joins in slice 3, and the backups and the backup sidecar in slice 5.
export const healthParts = [
  'database',
  'definitions',
  'imp_host',
  'conversation_imp',
  'disk',
] as const;

export type HealthPart = (typeof healthParts)[number];

// Liveness holds while the process answers and the database opens.
export const livenessParts = ['process', 'database'] as const;

export type LivenessPart = (typeof livenessParts)[number];
