export const callEndedBys = ['you', 'nixie', 'budget', 'missed', 'declined', 'dropped'] as const;

export type CallEndedBy = (typeof callEndedBys)[number];
