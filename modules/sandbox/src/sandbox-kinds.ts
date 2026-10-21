import type { SandboxKind } from './types';

export interface SandboxKindRule {
  readonly egress: 'none' | 'public' | 'allow';
  readonly hasModelGrant: boolean;
  readonly toolRoute: boolean;
}

export const sandboxKinds: Readonly<Record<SandboxKind, SandboxKindRule>> = {
  conversation: { egress: 'none', hasModelGrant: true, toolRoute: true },
  checker: { egress: 'none', hasModelGrant: true, toolRoute: false },
  worker: { egress: 'none', hasModelGrant: true, toolRoute: true },
  code_run: { egress: 'none', hasModelGrant: false, toolRoute: false },
  fetch: { egress: 'public', hasModelGrant: false, toolRoute: false },
  coding: { egress: 'allow', hasModelGrant: true, toolRoute: true },
};
