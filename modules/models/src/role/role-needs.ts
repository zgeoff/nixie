import type { HarnessCapability } from '@heynixie/wire';
import type { ModelRole } from '../types';

export const roleNeeds: Readonly<Record<ModelRole, ReadonlySet<HarnessCapability>>> = {
  conversation: new Set([
    'tools',
    'resume',
    'resume-at-entry',
    'live-messages',
    'interrupt',
    'summarize',
    'images',
    'call-usage',
    'context-window',
  ]),
  task: new Set(['tools', 'fresh-session', 'interrupt', 'images', 'turn-limit', 'call-usage']),
  worker: new Set(['tools', 'fresh-session', 'interrupt', 'turn-limit', 'call-usage']),
  checker: new Set(['structured-output']),
  call: new Set(['tools', 'resume', 'resume-at-entry', 'live-messages', 'interrupt', 'call-usage']),
};
