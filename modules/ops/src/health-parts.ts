// The parts that readiness waits on, because nixie cannot serve while one fails. A part joins in the
// slice that builds it, so no part holds readiness down or reports a check that never ran: spending
// joins in slice 3, and the backups and the backup sidecar in slice 5.
export const healthParts = ['database', 'definitions'] as const;

export type HealthPart = (typeof healthParts)[number];

// The services and the volume that nixie depends on. One that fails or answers slowly makes the
// readiness status degraded, which still answers 200, because nixie still serves its API while
// they fail and it runs as the only endpoint behind its Service.
export const dependencyParts = ['imp_host', 'conversation_imp', 'disk'] as const;

export type DependencyPart = (typeof dependencyParts)[number];

// The parts that the readiness report shows beside the others but never waits on, because nixie
// still answers while they fail: a failing advisory part shows in the report's body while the
// status stays as the other parts set it.
export const advisoryParts = ['conversation_turns'] as const;

export type AdvisoryPart = (typeof advisoryParts)[number];

// Liveness holds while the process answers and the database opens.
export const livenessParts = ['process', 'database'] as const;

export type LivenessPart = (typeof livenessParts)[number];
