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

export const harnessCapabilities: Readonly<Record<HarnessID, ReadonlySet<HarnessCapability>>> = {
  'agent-sdk': new Set([
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
  ]),
  codex: new Set(['tools', 'fresh-session', 'interrupt', 'images', 'turn-limit', 'call-usage']),
};
