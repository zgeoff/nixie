import type { SandboxKind } from './types';

export interface SandboxKindRule {
  readonly egress: 'none' | 'public' | 'allow';
  readonly hasModelGrant: boolean;
  readonly toolRoute: boolean;
}

// The sandbox each kind of work gets. The conversation lives for the deployment, kept awake; a
// worker and a code run for one tool call; the fetch sandbox for many fetches, then replaced; and a
// coding session for the session, with other grants by rule.
export const sandboxKinds: Readonly<Record<SandboxKind, SandboxKindRule>> = {
  conversation: { egress: 'none', hasModelGrant: true, toolRoute: true },
  worker: { egress: 'none', hasModelGrant: true, toolRoute: true },
  code_run: { egress: 'none', hasModelGrant: false, toolRoute: false },
  fetch: { egress: 'public', hasModelGrant: false, toolRoute: false },
  coding: { egress: 'allow', hasModelGrant: true, toolRoute: true },
};
