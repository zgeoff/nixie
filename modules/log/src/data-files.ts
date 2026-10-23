export const dataFiles = ['nixie.db', 'keys.db'] as const;

export type DataFile = (typeof dataFiles)[number];
