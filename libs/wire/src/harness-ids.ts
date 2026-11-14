export const harnessIDs = ['agent-sdk', 'codex'] as const;

export type HarnessID = (typeof harnessIDs)[number];

export type HarnessCapability =
  | 'tools'
  | 'fresh-session'
  | 'resume'
  | 'resume-at-entry'
  | 'live-messages'
  | 'interrupt'
  | 'summarize'
  | 'structured-output'
  | 'images'
  | 'turn-limit'
  | 'call-usage'
  | 'context-window';

export const harnessCapabilityLists = {
  'agent-sdk': [
    'tools',
    'fresh-session',
    'resume',
    'resume-at-entry',
    'live-messages',
    'interrupt',
    'summarize',
    'structured-output',
    'images',
    'turn-limit',
    'call-usage',
    'context-window',
  ],
  codex: ['tools', 'fresh-session', 'interrupt', 'images', 'turn-limit', 'call-usage'],
} as const satisfies Record<HarnessID, readonly HarnessCapability[]>;

// True exactly when the harness declares both resume and resume-at-entry, the two capabilities that
// make a session.
export type HasSession<ID extends HarnessID> =
  | 'resume'
  | 'resume-at-entry' extends (typeof harnessCapabilityLists)[ID][number]
  ? true
  : false;

export const harnessCapabilities: Readonly<Record<HarnessID, ReadonlySet<HarnessCapability>>> = {
  'agent-sdk': new Set(harnessCapabilityLists['agent-sdk']),
  codex: new Set(harnessCapabilityLists.codex),
};
