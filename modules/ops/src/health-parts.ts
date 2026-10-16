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

// The parts that the readiness report shows beside the readiness parts but never waits on, because
// nixie still answers while they fail: routing to nixie depends only on the parts above, and a
// failing advisory part shows in the report's body while the status stays ready.
export const advisoryParts = ['conversation_turns'] as const;

export type AdvisoryPart = (typeof advisoryParts)[number];

// Liveness holds while the process answers and the database opens.
export const livenessParts = ['process', 'database'] as const;

export type LivenessPart = (typeof livenessParts)[number];
