export const healthParts = ['database', 'definitions'] as const;

export type HealthPart = (typeof healthParts)[number];

export const dependencyParts = ['imp_host', 'conversation_imp', 'disk'] as const;

export type DependencyPart = (typeof dependencyParts)[number];

export const advisoryParts = ['conversation_turns'] as const;

export type AdvisoryPart = (typeof advisoryParts)[number];

export const livenessParts = ['process', 'database'] as const;

export type LivenessPart = (typeof livenessParts)[number];
